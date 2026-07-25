using System.Reflection;
using Microsoft.Extensions.DependencyInjection;

namespace CineReel.Service.Events;

public static class DomainEventServiceCollectionExtensions
{
    public static IServiceCollection AddDomainEvents(this IServiceCollection services, IEnumerable<Assembly> assemblies)
    {
        services.AddSingleton<InProcessDomainEventBus>();
        services.AddSingleton<IRetryDelay, SystemRetryDelay>();
        services.AddSingleton<IDomainEventBus>(provider =>
            new RetryingDomainEventBus(
                provider.GetRequiredService<InProcessDomainEventBus>(),
                provider.GetRequiredService<IEntityFailureMarker>(),
                provider.GetRequiredService<IRetryDelay>(),
                provider.GetRequiredService<ILogger<RetryingDomainEventBus>>()));

        foreach (var implementation in assemblies.SelectMany(static assembly => assembly.DefinedTypes)
                     .Where(static type => !type.IsAbstract && !type.IsInterface))
        {
            foreach (var contract in implementation.ImplementedInterfaces.Where(static contract =>
                         contract.IsGenericType && contract.GetGenericTypeDefinition() == typeof(IDomainEventHandler<>)))
            {
                services.AddTransient(contract, implementation);
            }
        }

        return services;
    }
}
