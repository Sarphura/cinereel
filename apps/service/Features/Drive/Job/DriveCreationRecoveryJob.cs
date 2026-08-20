namespace Cinereel.Features.Drive;

internal sealed class DriveCreationRecoveryJob(
    IServiceScopeFactory scopeFactory,
    ILogger<DriveCreationRecoveryJob> logger) : BackgroundService
{
    private static readonly TimeSpan RetryInterval = TimeSpan.FromMinutes(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(RetryInterval);

        do
        {
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                var driveService = scope.ServiceProvider.GetRequiredService<DriveService>();
                await driveService.RecoverIncompleteCreationsAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "恢复未完成的 Drive 创建操作失败。");
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
