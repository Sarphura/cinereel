using CineReel.Service.Events;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace CineReel.Service.Tests;

public sealed class InProcessDomainEventBusTests
{
    [Fact]
    public async Task Publish_invokes_handlers_in_registration_order()
    {
        var calls = new List<string>();
        var services = new ServiceCollection();
        services.AddSingleton(calls);
        services.AddTransient<IDomainEventHandler<TestEvent>, FirstHandler>();
        services.AddTransient<IDomainEventHandler<TestEvent>, SecondHandler>();
        await using var provider = services.BuildServiceProvider();
        var bus = new InProcessDomainEventBus(provider);

        await bus.PublishAsync(new TestEvent(), CancellationToken.None);

        Assert.Equal(["first", "second"], calls);
    }

    [Fact]
    public async Task Nested_publish_completes_before_next_outer_handler()
    {
        var calls = new List<string>();
        var services = new ServiceCollection();
        services.AddSingleton(calls);
        services.AddSingleton<IDomainEventBus, InProcessDomainEventBus>();
        services.AddTransient<IDomainEventHandler<TestEvent>, NestedPublisher>();
        services.AddTransient<IDomainEventHandler<TestEvent>, SecondHandler>();
        services.AddTransient<IDomainEventHandler<NestedEvent>, NestedHandler>();
        await using var provider = services.BuildServiceProvider();

        await provider.GetRequiredService<IDomainEventBus>()
            .PublishAsync(new TestEvent(), CancellationToken.None);

        Assert.Equal(["outer-start", "nested", "outer-end", "second"], calls);
    }

    private sealed record TestEvent : IDomainEvent;
    private sealed record NestedEvent : IDomainEvent;

    private sealed class FirstHandler(List<string> calls) : IDomainEventHandler<TestEvent>
    {
        public Task HandleAsync(TestEvent evt, CancellationToken cancellationToken)
        {
            calls.Add("first");
            return Task.CompletedTask;
        }
    }

    private sealed class SecondHandler(List<string> calls) : IDomainEventHandler<TestEvent>
    {
        public Task HandleAsync(TestEvent evt, CancellationToken cancellationToken)
        {
            calls.Add("second");
            return Task.CompletedTask;
        }
    }

    private sealed class NestedPublisher(List<string> calls, IDomainEventBus bus) : IDomainEventHandler<TestEvent>
    {
        public async Task HandleAsync(TestEvent evt, CancellationToken cancellationToken)
        {
            calls.Add("outer-start");
            await bus.PublishAsync(new NestedEvent(), cancellationToken);
            calls.Add("outer-end");
        }
    }

    private sealed class NestedHandler(List<string> calls) : IDomainEventHandler<NestedEvent>
    {
        public Task HandleAsync(NestedEvent evt, CancellationToken cancellationToken)
        {
            calls.Add("nested");
            return Task.CompletedTask;
        }
    }
}
