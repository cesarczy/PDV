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

  function getCurrentSessionPurchases(clientId, purchases) {
    const clientPurchases = purchases.filter((purchase) => purchase.clientId === clientId);
    const closedConsumables = clientPurchases.filter(
      (purchase) => purchase.itemId !== 'entry-fee' && purchase.closedAt
    );
    const lastSessionEnd = closedConsumables.length
      ? Math.max(...closedConsumables.map((purchase) => new Date(purchase.closedAt).getTime()))
      : 0;

    return clientPurchases.filter((purchase) => {
      if (!purchase.closedAt) {
        return true;
      }
      if (purchase.itemId === 'entry-fee') {
        return new Date(purchase.createdAt).getTime() > lastSessionEnd;
      }
      return false;
    });
  }

  function cancelClientKey(state, clientId) {
    const client = state.clients.find((entry) => entry.id === clientId);
    if (!client) {
      return state;
    }

    const sessionPurchases = getCurrentSessionPurchases(clientId, state.purchases);
    const sessionPurchaseIds = new Set(sessionPurchases.map((purchase) => purchase.id));

    sessionPurchases.forEach((purchase) => {
      if (purchase.itemId !== 'entry-fee') {
        const item = state.items.find((entry) => entry.id === purchase.itemId);
        if (item) {
          item.stock += purchase.quantity;
        }
      }
    });

    state.purchases = state.purchases.filter((purchase) => !sessionPurchaseIds.has(purchase.id));
    client.status = 'livre';
    client.name = `Chave ${client.ficha}`;
    return state;
  }

  return {
    buildInitialClients,
    getOpenPurchases,
    getClientPurchases,
    getClientTotal,
    closeClientAccount,
    cancelClientKey
  };
});
