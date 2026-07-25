using System.Net;

namespace CineReel.Service.Infrastructure.HyperAgent;

public sealed record HyperAgentFileResponse(
    HttpStatusCode StatusCode,
    string ContentType,
    long? ContentLength,
    string? ContentRange,
    byte[] Body);