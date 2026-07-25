namespace CineReel.Service.Features.Rbac;

public static class PermissionCatalog
{
    public const string LibraryRead = "library:read";
    public const string LibraryWrite = "library:write";
    public const string PublishCreate = "publish:create";
    public const string PublishDelete = "publish:delete";
    public const string SubscribeCreate = "subscribe:create";
    public const string SubscribeDelete = "subscribe:delete";
    public const string Download = "download:*";
    public const string Admin = "admin:*";
    public const string ProfileWrite = "profile:write";
    public const string All = "*";

    public static readonly IReadOnlyCollection<string> AllPermissions = new[]
    {
        LibraryRead,
        LibraryWrite,
        PublishCreate,
        PublishDelete,
        SubscribeCreate,
        SubscribeDelete,
        Download,
        Admin,
        ProfileWrite,
        All,
    };
}
