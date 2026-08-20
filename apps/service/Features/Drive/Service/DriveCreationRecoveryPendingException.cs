namespace Cinereel.Features.Drive;

internal sealed class DriveCreationRecoveryPendingException()
    : Exception("上一次 Drive 创建仍在等待补偿恢复。");
