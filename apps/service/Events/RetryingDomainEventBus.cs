namespace CineReel.Service.Events;

public sealed class RetryingDomainEventBus(
    IDomainEventBus inner,
    IEntityFailureMarker failureMarker,
    IRetryDelay retryDelay,
    ILogger<RetryingDomainEventBus> logger) : IDomainEventBus
{
    private const int MaximumRetries = 3;
    private static readonly TimeSpan[] Backoff =
    [
        TimeSpan.FromMilliseconds(200),
        TimeSpan.FromSeconds(1),
        TimeSpan.FromSeconds(5),
    ];

    public async Task PublishAsync<TEvent>(TEvent evt, CancellationToken cancellationToken = default)
        where TEvent : IDomainEvent
    {
        Exception? lastFailure = null;
        for (var attempt = 0; attempt <= MaximumRetries; attempt++)
        {
            try
            {
                await inner.PublishAsync(evt, cancellationToken);
                return;
            }
            catch (RecoverableException exception) when (attempt < MaximumRetries)
            {
                lastFailure = exception;
                var delay = AddJitter(exception.RetryAfter > TimeSpan.Zero ? exception.RetryAfter : Backoff[attempt]);
                logger.LogWarning(exception,
                    "Domain event {EventType} handler failed on attempt {Attempt}; retrying after {DelayMs}ms",
                    typeof(TEvent).Name, attempt + 1, delay.TotalMilliseconds);
                await retryDelay.WaitAsync(delay, cancellationToken);
            }
            catch (Exception exception)
            {
                lastFailure = exception;
                break;
            }
        }

        if (evt is IEntityDomainEvent entityEvent && lastFailure is not null)
        {
            await failureMarker.MarkFailedAsync(
                entityEvent.EntityType,
                entityEvent.EntityId,
                lastFailure,
                cancellationToken);
        }
    }

    private static TimeSpan AddJitter(TimeSpan delay)
    {
        var factor = 0.8 + (Random.Shared.NextDouble() * 0.4);
        return TimeSpan.FromMilliseconds(Math.Max(1, delay.TotalMilliseconds * factor));
    }
}
