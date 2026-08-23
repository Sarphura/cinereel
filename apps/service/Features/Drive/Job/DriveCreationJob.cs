namespace Cinereel.Features.Drive;

internal sealed class DriveCreationJob(
    IServiceScopeFactory scopeFactory,
    ILogger<DriveCreationJob> logger) : BackgroundService
{
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(PollInterval);

        do
        {
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                var driveService = scope.ServiceProvider.GetRequiredService<DriveService>();
                await driveService.ProcessPendingCreationsAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "处理 Pending Drive 失败。");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
