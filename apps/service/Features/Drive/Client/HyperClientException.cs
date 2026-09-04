namespace Cinereel.Features.Drive;

internal sealed class HyperClientException : Exception
{
    internal HyperClientException(string message)
        : base(message)
    {
    }

    internal HyperClientException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
