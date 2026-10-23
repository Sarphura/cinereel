using MediatR;

namespace Cinereel.Features.File;

public sealed class FileCommandHandler : IRequestHandler<FileCommand>
{
    public Task Handle(FileCommand request, CancellationToken cancellationToken)
    {
        return Task.CompletedTask;
    }
}