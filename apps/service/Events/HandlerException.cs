namespace CineReel.Service.Events;

public abstract class HandlerException : Exception
{
    protected HandlerException(string message, Exception? innerException = null)
        : base(message, innerException) { }
}

public sealed class RecoverableException : HandlerException
{
    public RecoverableException(string message, TimeSpan retryAfter, Exception? innerException = null)
        : base(message, innerException)
    {
        RetryAfter = retryAfter;
    }

    public TimeSpan RetryAfter { get; }
}

public sealed class NonRecoverableException : HandlerException
{
    public NonRecoverableException(string message, Exception? innerException = null)
        : base(message, innerException) { }
}
