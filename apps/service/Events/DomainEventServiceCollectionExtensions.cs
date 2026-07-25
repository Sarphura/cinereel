using System.Reflection;
using Microsoft.Extensions.DependencyInjection;

namespace CineReel.Service.Events;

public static class DomainEventServiceCollectionExtensions
{
    public static IServiceCollection AddDomainEvents(this IServiceCollection services, IEnumerable<Assembly> assemblies)
    {
        services.AddSingleton<InProcessDomainEventBus>();
        services.AddSingleton<IDomainEventBus>(provider => provider.GetRequiredService<InProcessDomainEventBus>());

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
