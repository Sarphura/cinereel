namespace CineReel.Service.Features.Accounts;

public sealed class SessionExpirySweeper(ISessionRepository sessions, TimeProvider clock) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await sessions.RemoveExpiredAsync(clock.GetUtcNow(), stoppingToken);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception exception)
            {
                Console.Error.WriteLine($"[session-sweeper] failed to clean expired sessions: {exception.Message}");
            }
            try
            {
                await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
            }
            catch (OperationCanceledException) { break; }
        }
    }
}
