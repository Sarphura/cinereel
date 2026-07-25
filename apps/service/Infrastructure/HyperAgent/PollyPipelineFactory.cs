using System.Net.Sockets;
using Polly;
using Polly.CircuitBreaker;
using Polly.Retry;
using Polly.Timeout;

namespace CineReel.Service.Infrastructure.HyperAgent;

public static class PollyPipelineFactory
{
    public static ResiliencePipeline Create()
    {
        var transient = new PredicateBuilder()
            .Handle<HttpRequestException>(exception =>
                !exception.StatusCode.HasValue || (int)exception.StatusCode.Value >= 500)
            .Handle<SocketException>()
            .Handle<TaskCanceledException>();

        return new ResiliencePipelineBuilder()
            .AddTimeout(new TimeoutStrategyOptions { Timeout = TimeSpan.FromSeconds(30) })
            .AddRetry(new RetryStrategyOptions
            {
                ShouldHandle = transient,
                MaxRetryAttempts = 3,
                Delay = TimeSpan.FromMilliseconds(200),
                BackoffType = DelayBackoffType.Exponential,
                UseJitter = true,
            })
            .AddCircuitBreaker(new CircuitBreakerStrategyOptions
            {
                ShouldHandle = transient,
                FailureRatio = 0.5,
                MinimumThroughput = 5,
                SamplingDuration = TimeSpan.FromSeconds(30),
                BreakDuration = TimeSpan.FromSeconds(30),
            })
            .Build();
    }
}
