(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.BebidasLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function buildInitialClients() {
    return Array.from({ length: 100 }, (_, index) => ({
      id: `chave-${index + 1}`,
      name: `Chave ${index + 1}`,
      ficha: index + 1,
      status: 'livre'
    }));
  }

  function getOpenPurchases(clientId, purchases) {
    return purchases.filter(
      (purchase) => purchase.clientId === clientId && !purchase.closedAt
    );
  }

  function getClientPurchases(clientId, purchases) {
    return getOpenPurchases(clientId, purchases).filter(
      (purchase) => purchase.itemId !== 'entry-fee'
    );
  }

  function getClientTotal(clientId, purchases) {
    return getClientPurchases(clientId, purchases).reduce(
      (total, purchase) => total + purchase.total,
      0
    );
  }

  function closeClientAccount(state, clientId) {
    const client = state.clients.find((entry) => entry.id === clientId);
    if (!client) {
      return state;
    }

    client.status = 'livre';
    client.name = `Chave ${client.ficha}`;
    const closedAt = new Date().toISOString();
    state.purchases.forEach((purchase) => {
      if (purchase.clientId === clientId && !purchase.closedAt) {
        purchase.closedAt = closedAt;
      }
    });
    return state;
  }

  return {
    buildInitialClients,
    getOpenPurchases,
    getClientPurchases,
    getClientTotal,
    closeClientAccount
  };
});
