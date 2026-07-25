using CineReel.Service.Data.Entities;

namespace CineReel.Service.Features.Accounts;

public interface IAccountRepository
{
    Task<AccountEntity?> FindByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<AccountEntity?> FindByUsernameAsync(string username, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<AccountEntity>> ListAsync(CancellationToken cancellationToken = default);
    Task<AccountEntity> AddAsync(AccountEntity account, CancellationToken cancellationToken = default);
    Task SaveAsync(AccountEntity account, CancellationToken cancellationToken = default);
}

public sealed class InMemoryAccountRepository : IAccountRepository
{
    private readonly Dictionary<int, AccountEntity> _items = [];
    private int _nextId = 1;
    public Task<AccountEntity?> FindByIdAsync(int id, CancellationToken cancellationToken = default) => Task.FromResult(_items.GetValueOrDefault(id));
    public Task<AccountEntity?> FindByUsernameAsync(string username, CancellationToken cancellationToken = default) => Task.FromResult(_items.Values.SingleOrDefault(item => string.Equals(item.Username, username, StringComparison.OrdinalIgnoreCase)));
    public Task<IReadOnlyList<AccountEntity>> ListAsync(CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyList<AccountEntity>>(_items.Values.ToList());
    public Task<AccountEntity> AddAsync(AccountEntity account, CancellationToken cancellationToken = default) { account.Id = account.Id == 0 ? _nextId++ : account.Id; _items[account.Id] = account; return Task.FromResult(account); }
    public Task SaveAsync(AccountEntity account, CancellationToken cancellationToken = default) { _items[account.Id] = account; return Task.CompletedTask; }
}
