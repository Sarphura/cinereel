namespace CineReel.Service.Infrastructure.Auth;

public static class CineReelAuth
{
    public const string Scheme = "CinereelSession";
    public static readonly TimeSpan DefaultLifetime = TimeSpan.FromDays(30);
}
