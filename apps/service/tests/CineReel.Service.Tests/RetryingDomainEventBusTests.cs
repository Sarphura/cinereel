using CineReel.Service.Events;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace CineReel.Service.Tests;

public sealed class RetryingDomainEventBusTests
{
    [Fact]
    public async Task Recoverable_failure_is_retried_three_times_then_marked_failed()
    {
        var inner = new FailingBus(4, new RecoverableException("temporary", TimeSpan.FromMilliseconds(10)));
        var marker = new RecordingFailureMarker();
        var delay = new RecordingRetryDelay();
        var bus = new RetryingDomainEventBus(inner, marker, delay, NullLogger<RetryingDomainEventBus>.Instance);

        await bus.PublishAsync(new EntityEvent(), CancellationToken.None);

        Assert.Equal(4, inner.Attempts);
        Assert.Equal(3, delay.Delays.Count);
        Assert.Single(marker.Failures);
    }

    [Fact]
    public async Task Recoverable_failure_eventually_succeeds_without_marking_failed()
    {
        var inner = new FailingBus(2, new RecoverableException("temporary", TimeSpan.FromMilliseconds(10)));
        var marker = new RecordingFailureMarker();
        var bus = new RetryingDomainEventBus(inner, marker, new RecordingRetryDelay(), NullLogger<RetryingDomainEventBus>.Instance);

        await bus.PublishAsync(new EntityEvent(), CancellationToken.None);

        Assert.Equal(3, inner.Attempts);
        Assert.Empty(marker.Failures);
    }

    [Fact]
    public async Task Non_recoverable_failure_skips_retry()
    {
        var inner = new FailingBus(1, new NonRecoverableException("permanent"));
        var marker = new RecordingFailureMarker();
        var delay = new RecordingRetryDelay();
        var bus = new RetryingDomainEventBus(inner, marker, delay, NullLogger<RetryingDomainEventBus>.Instance);

        await bus.PublishAsync(new EntityEvent(), CancellationToken.None);

        Assert.Equal(1, inner.Attempts);
        Assert.Empty(delay.Delays);
        Assert.Single(marker.Failures);
    }

    private sealed record EntityEvent : IEntityDomainEvent
    {
        public string EntityType => "subscription";
        public object EntityId => 42;
    }

    private sealed class FailingBus(int failuresBeforeSuccess, Exception failure) : IDomainEventBus
    {
        public int Attempts { get; private set; }

        public Task PublishAsync<TEvent>(TEvent evt, CancellationToken cancellationToken = default) where TEvent : IDomainEvent
        {
            Attempts++;
            return Attempts <= failuresBeforeSuccess ? Task.FromException(failure) : Task.CompletedTask;
        }
    }

    private sealed class RecordingFailureMarker : IEntityFailureMarker
    {
        public List<(string Type, object Id, Exception Cause)> Failures { get; } = [];

        public Task MarkFailedAsync(string entityType, object entityId, Exception cause, CancellationToken cancellationToken)
        {
            Failures.Add((entityType, entityId, cause));
            return Task.CompletedTask;
        }
    }

    private sealed class RecordingRetryDelay : IRetryDelay
    {
        public List<TimeSpan> Delays { get; } = [];
        public Task WaitAsync(TimeSpan delay, CancellationToken cancellationToken)
        {
            Delays.Add(delay);
            return Task.CompletedTask;
        }
    }
}
