# Errors propagate as exceptions; ASP.NET Core's IExceptionHandler maps them to ProblemDetails

The C# Application Server uses exceptions as the single error-propagation mechanism. There is no `Result<T>` type or discriminated-union style of return. Three exception categories exist:

- `DomainValidationException` — input validation failure (e.g. invalid DriveKey format, duplicate subscription). Maps to HTTP 400.
- `RecoverableException` — transient dependency failure. Bus retries up to 3 times with backoff (ADR 0027). On final failure maps to HTTP 503.
- `NonRecoverableException` — non-recoverable application error. Maps to HTTP 500. Logs include stack trace.
- All other uncaught exceptions — ASP.NET Core's default 500 with a ProblemDetails body.

## Context

Grilling considered three patterns: pure exceptions, `Result<T>`, and a hybrid. .NET convention is exceptions; Result-style unions are more common in F# or Rust-leaning codebases. For V1's scale, the simpler model wins.

## Decision

### Exception hierarchy

```csharp
namespace Cinereel.Events;

public abstract class HandlerException : Exception
{
    protected HandlerException(string message, Exception? inner = null)
        : base(message, inner) { }
}

public sealed class RecoverableException : HandlerException { /* ADR 0027 */ }
public sealed class NonRecoverableException : HandlerException { /* ADR 0027 */ }

namespace Cinereel.Domain;

public sealed class DomainValidationException : Exception
{
    public IReadOnlyDictionary<string, string[]> Errors { get; }
    public DomainValidationException(IReadOnlyDictionary<string, string[]> errors)
        : base("validation failed")
    {
        Errors = errors;
    }
}
```

### IExceptionHandler

The App Server registers a `DomainExceptionHandler : IExceptionHandler` that maps exceptions to RFC 9457 ProblemDetails responses:

```csharp
public sealed class DomainExceptionHandler : IExceptionHandler
{
    public ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        ProblemDetails problem = exception switch
        {
            DomainValidationException v => new()
            {
                Status = StatusCodes.Status400BadRequest,
                Title = "validation failed",
                Extensions = { ["errors"] = v.Errors }
            },
            RecoverableException r => new()
            {
                Status = StatusCodes.Status503ServiceUnavailable,
                Title = "transient failure",
                Detail = r.Message
            },
            NonRecoverableException nr => new()
            {
                Status = StatusCodes.Status500InternalServerError,
                Title = "non-recoverable failure",
                Detail = nr.Message
            },
            _ => new() { Status = StatusCodes.Status500InternalServerError }
        };

        httpContext.Response.StatusCode = problem.Status ?? 500;
        httpContext.Response.WriteAsJsonAsync(problem, cancellationToken);
        return ValueTask.FromResult(true);
    }
}
```

### Where exceptions are caught

- **Inside service methods**: catch `RecoverableException` and rethrow if it should bubble (e.g. after exhaustion). Domain services don't catch broadly.
- **In Minimal API endpoints**: top-level `try { ... } catch (Exception ex) when (!ex.IsHandledByDomainHandler())` for unhandled error logging.
- **In the domain event bus**: catch handler exceptions (ADR 0027 retry semantics).

### What is NOT in V1

- `Result<T>`, `OneOf<T1, T2>`, or any discriminated-union return types.
- FluentValidation or similar library. Validation is hand-rolled in service methods.
- A global error reporting sink (Sentry, etc.). Logs go to stdout + optional file.

## Trade-off accepted

- Exceptions carry control flow, which is the older Java/C# style. Some teams find Result types easier to reason about. We accept the convention to keep the codebase idiomatic .NET.
- Unhandled exceptions leak stack traces in development mode. In production they're logged but not returned to clients (the ProblemDetails body has no stack).