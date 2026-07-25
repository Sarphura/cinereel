namespace CineReel.Service.Infrastructure.ProblemDetails;

public static class ProblemTypes
{
    public const string BaseUri = "https://cinereel.dev/errors/";
    public const string ValidationFailed = BaseUri + "validation-failed";
    public const string Unauthenticated = BaseUri + "unauthenticated";
    public const string Forbidden = BaseUri + "forbidden";
    public const string SubscriptionNotFound = BaseUri + "subscription-not-found";
    public const string MediaItemNotFound = BaseUri + "media-item-not-found";
    public const string DriveNotMounted = BaseUri + "drive-not-mounted";
    public const string InvalidDriveKey = BaseUri + "invalid-drive-key";
    public const string InvalidImdbId = BaseUri + "invalid-imdb-id";
    public const string DuplicateSubscription = BaseUri + "duplicate-subscription";
    public const string NfoParseFailed = BaseUri + "nfo-parse-failed";
    public const string JellyfinPushFailed = BaseUri + "jellyfin-push-failed";
    public const string BtEngineUnavailable = BaseUri + "bt-engine-unavailable";
    public const string TrailerFetchFailed = BaseUri + "trailer-fetch-failed";
    public const string HyperAgentUnavailable = BaseUri + "hyper-agent-unavailable";
    public const string Internal = BaseUri + "internal";
    public const string NotFound = BaseUri + "not-found";
    public static string HttpStatus(int status) => BaseUri + $"http-{status}";
}
