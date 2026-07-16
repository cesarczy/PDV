const STORAGE_KEY = 'bebidas-system-v1';
const STORAGE_VERSION = 2;

const initialState = {
  version: STORAGE_VERSION,
  loggedIn: false,
  activeSection: 'clientes',
  activeKeyId: null,
  items: [
    { id: crypto.randomUUID(), name: 'Coca-Cola', price: 6.5, stock: 20 },
    { id: crypto.randomUUID(), name: 'Água', price: 3.5, stock: 30 },
    { id: crypto.randomUUID(), name: 'Batata frita', price: 12, stock: 15 }
  ],
  clients: window.BebidasLogic.buildInitialClients(),
  purchases: [],
  entryFee: 0,
  users: [
    { id: 'user-admin', name: 'Administrador', login: 'admin', password: 'admin123' }
  ]
};

let state = initialState;
let saveQueue = Promise.resolve();

const loginSection = document.getElementById('loginSection');
const dashboard = document.getElementById('dashboard');
const logoutBtn = document.getElementById('logoutBtn');

const loginForm = document.getElementById('loginForm');
const itemForm = document.getElementById('itemForm');
const userForm = document.getElementById('userForm');
const userSubmitBtn = document.getElementById('userSubmitBtn');
const usersTableBody = document.getElementById('usersTableBody');
const userNameInput = document.getElementById('userName');
const userLoginInput = document.getElementById('userLogin');
const userPasswordInput = document.getElementById('userPassword');
const userCancelEditBtn = document.getElementById('userCancelEditBtn');

const itemsTableBody = document.getElementById('itemsTableBody');
const navigationButtons = document.querySelectorAll('.nav-btn');
const keysGrid = document.getElementById('keysGrid');
const keysInUseInfo = document.getElementById('keysInUseInfo');
const modalProductForm = document.getElementById('modalProductForm');
const confirmModal = document.getElementById('confirmModal');
const confirmBackdrop = document.getElementById('confirmBackdrop');
const confirmTitle = document.getElementById('confirmTitle');
const confirmMessage = document.getElementById('confirmMessage');
const confirmTotal = document.getElementById('confirmTotal');
const confirmOkBtn = document.getElementById('confirmOkBtn');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');
const editItemModal = document.getElementById('editItemModal');
const editItemBackdrop = document.getElementById('editItemBackdrop');
const closeEditItemBtn = document.getElementById('closeEditItemBtn');
const editItemForm = document.getElementById('editItemForm');
const editItemTitle = document.getElementById('editItemTitle');
const editItemCurrentStock = document.getElementById('editItemCurrentStock');
const editItemName = document.getElementById('editItemName');
const editItemPrice = document.getElementById('editItemPrice');
const editAddStock = document.getElementById('editAddStock');
const editEntryFeeModal = document.getElementById('editEntryFeeModal');
const editEntryFeeBackdrop = document.getElementById('editEntryFeeBackdrop');
const closeEditEntryFeeBtn = document.getElementById('closeEditEntryFeeBtn');
const editEntryFeeForm = document.getElementById('editEntryFeeForm');
const editEntryFeeInput = document.getElementById('editEntryFee');

let currentConfirmAction = null;
let activeEditItemId = null;
let currentEditedUserId = null;
let currentPasswordUserId = null;

async function loadState() {
  try {
    const response = await fetch('/api/state');
    if (!response.ok) {
      throw new Error('Falha ao carregar estado do servidor');
    }
    const parsed = await response.json();
    state = {
      ...initialState,
      ...parsed,
      items: Array.isArray(parsed.items) && parsed.items.length ? parsed.items : initialState.items,
      clients: Array.isArray(parsed.clients) && parsed.clients.length ? parsed.clients : initialState.clients,
      purchases: Array.isArray(parsed.purchases) ? parsed.purchases : [],
      entryFee: Number(parsed.entryFee) || 0,
      users: Array.isArray(parsed.users) && parsed.users.length ? parsed.users : initialState.users
    };
  } catch (error) {
    console.error('Erro ao carregar estado do servidor', error);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.version === STORAGE_VERSION) {
          state = {
            ...initialState,
            ...parsed,
            items: Array.isArray(parsed.items) && parsed.items.length ? parsed.items : initialState.items,
            clients: Array.isArray(parsed.clients) && parsed.clients.length ? parsed.clients : initialState.clients,
            purchases: Array.isArray(parsed.purchases) ? parsed.purchases : [],
            entryFee: Number(parsed.entryFee) || 0,
            users: Array.isArray(parsed.users) && parsed.users.length ? parsed.users : initialState.users
          };
        }
      } catch (storageError) {
        console.error('Erro ao carregar estado do localStorage', storageError);
      }
    }
  }
  render();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  const snapshot = JSON.stringify({
    items: state.items,
    clients: state.clients,
    purchases: state.purchases,
    entryFee: state.entryFee,
    users: state.users
  });

  saveQueue = saveQueue
    .then(async () => {
      const response = await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: snapshot
      });
      if (!response.ok) {
        throw new Error('Falha ao salvar estado no servidor');
      }
    })
    .catch((error) => {
      console.error('Erro ao salvar estado no servidor', error);
    });

  return saveQueue;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
}

function getLocalDateKey(timestamp) {
  const date = new Date(timestamp);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function setActiveSection(sectionName) {
  state.activeSection = sectionName;
  saveState();
  render();
}

function render() {
  if (state.loggedIn) {
    loginSection.classList.add('hidden');
    dashboard.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
  } else {
    loginSection.classList.remove('hidden');
    dashboard.classList.add('hidden');
    logoutBtn.classList.add('hidden');
  }

  document.getElementById('cadastroSection').classList.toggle('hidden', state.activeSection !== 'cadastro');
  document.getElementById('clientesSection').classList.toggle('hidden', state.activeSection !== 'clientes');
  document.getElementById('usuariosSection').classList.toggle('hidden', state.activeSection !== 'usuarios');
  document.getElementById('relatoriosSection').classList.toggle('hidden', state.activeSection !== 'relatorios');

  navigationButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.section === state.activeSection);
  });

  renderItems();
  renderKeyPanel();
  
  if (state.activeSection === 'usuarios') {
    resetUserForm();
  }
  
  renderUsers();
}

function renderItems() {
  itemsTableBody.innerHTML = '';
  const entryFeeItem = getEntryFeeItem();
  const entryFeeRow = document.createElement('tr');
  entryFeeRow.innerHTML = `
    <td>Chave</td>
    <td>${formatCurrency(entryFeeItem?.price || 0)}</td>
    <td>—</td>
    <td><button type="button" class="edit-btn">Editar</button></td>
  `;
  entryFeeRow.querySelector('.edit-btn').addEventListener('click', openEditEntryFeeModal);
  itemsTableBody.appendChild(entryFeeRow);

  state.items.filter((item) => item.id !== 'entry-fee').forEach((item) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${item.name}</td>
      <td>${formatCurrency(item.price)}</td>
      <td>${item.stock}</td>
      <td><button type="button" class="edit-btn" data-item-id="${item.id}">Editar</button>
      <button type="button" class="ghost-btn delete-item-btn" data-item-id="${item.id}" style="color: #d32f2f;">Excluir</button></td>
    `;
    itemsTableBody.appendChild(row);
  });

  itemsTableBody.querySelectorAll('.edit-btn').forEach((button) => {
    button.addEventListener('click', () => openEditItemModal(button.dataset.itemId));
  });

  itemsTableBody.querySelectorAll('.delete-item-btn').forEach((button) => {
    button.addEventListener('click', () => deleteItem(button.dataset.itemId));
  });
}


const keyModal = document.getElementById('keyModal');
const modalBackdrop = document.getElementById('modalBackdrop');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalKeyTitle = document.getElementById('modalKeyTitle');
const modalProductSelect = document.getElementById('modalProductSelect');
const modalProductQuantity = document.getElementById('modalProductQuantity');
const modalSalesList = document.getElementById('modalSalesList');
const closeAccountBtn = document.getElementById('closeAccountBtn');

const changePasswordModal = document.getElementById('changePasswordModal');
const changePasswordBackdrop = document.getElementById('changePasswordBackdrop');
const closeChangePasswordBtn = document.getElementById('closeChangePasswordBtn');
const changePasswordForm = document.getElementById('changePasswordForm');
const newPasswordInput = document.getElementById('newPasswordInput');
const confirmNewPasswordInput = document.getElementById('confirmNewPasswordInput');

const editUserModal = document.getElementById('editUserModal');
const editUserBackdrop = document.getElementById('editUserBackdrop');
const closeEditUserBtn = document.getElementById('closeEditUserBtn');
const editUserForm = document.getElementById('editUserForm');
const editUserName = document.getElementById('editUserName');
const editUserLogin = document.getElementById('editUserLogin');
const editUserPassword = document.getElementById('editUserPassword');
const editUserTitle = document.getElementById('editUserTitle');

const relatorioForm = document.getElementById('relatorioForm');
const relatorioStartDate = document.getElementById('relatorioStartDate');
const relatorioEndDate = document.getElementById('relatorioEndDate');
const relatorioResult = document.getElementById('relatorioResult');
const relatorioResultDate = document.getElementById('relatorioResultDate');
const relatorioProducts = document.getElementById('relatorioProducts');
const relatorioSummary = document.getElementById('relatorioSummary');
const relatorioSummaryTitle = document.getElementById('relatorioSummaryTitle');
const exportPdfBtn = document.getElementById('exportPdfBtn');

let activeModalClientId = null;

function renderUsers() {
  usersTableBody.innerHTML = '';
  state.users.forEach((user) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${user.name}</td>
      <td>${user.login}</td>
      <td>
        <button type="button" class="ghost-btn user-edit-btn" data-user-id="${user.id}">Editar</button>
        <button type="button" class="ghost-btn user-password-btn" data-user-id="${user.id}">Trocar senha</button>
        <button type="button" class="ghost-btn user-delete-btn" data-user-id="${user.id}" style="color: #d32f2f;">Excluir</button>
      </td>
    `;
    usersTableBody.appendChild(row);
  });

  usersTableBody.querySelectorAll('.user-edit-btn').forEach((button) => {
    button.addEventListener('click', () => openUserEdit(button.dataset.userId));
  });

  usersTableBody.querySelectorAll('.user-password-btn').forEach((button) => {
    button.addEventListener('click', () => openChangePassword(button.dataset.userId));
  });

  usersTableBody.querySelectorAll('.user-delete-btn').forEach((button) => {
    button.addEventListener('click', () => deleteUser(button.dataset.userId));
  });
}

function resetUserForm() {
  userForm.reset();
}

function openUserEdit(userId) {
  const user = state.users.find((entry) => entry.id === userId);
  if (!user) return;
  currentEditedUserId = userId;
  editUserName.value = user.name;
  editUserLogin.value = user.login;
  editUserPassword.value = user.password;
  editUserTitle.textContent = `Editar ${user.name}`;
  editUserModal.classList.remove('hidden');
}

function closeEditUser() {
  currentEditedUserId = null;
  editUserForm.reset();
  editUserModal.classList.add('hidden');
}

function openChangePassword(userId) {
  const user = state.users.find((entry) => entry.id === userId);
  if (!user) return;
  currentPasswordUserId = userId;
  newPasswordInput.value = '';
  confirmNewPasswordInput.value = '';
  changePasswordModal.classList.remove('hidden');
}

function closeChangePassword() {
  currentPasswordUserId = null;
  changePasswordModal.classList.add('hidden');
}

function deleteUser(userId) {
  const user = state.users.find((entry) => entry.id === userId);
  if (!user) return;
  
  if (confirm(`Tem certeza que deseja excluir o usuário "${user.name}"?`)) {
    state.users = state.users.filter((entry) => entry.id !== userId);
    saveState();
    render();
  }
}

function deleteItem(itemId) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) return;
  
  if (confirm(`Tem certeza que deseja excluir o produto "${item.name}"?`)) {
    state.items = state.items.filter((entry) => entry.id !== itemId);
    saveState();
    render();
  }
}

function renderKeyPanel() {
  keysGrid.innerHTML = '';
  state.clients.forEach((client) => {
    const button = document.createElement('button');
    button.className = `key-btn ${client.status === 'em uso' ? 'in-use' : ''} ${state.activeKeyId === client.id ? 'active' : ''}`;
    button.type = 'button';
    button.textContent = client.ficha;
    button.title = client.status === 'em uso' ? 'Chave em uso' : 'Chave livre';
    button.addEventListener('click', () => openKeyModal(client));
    keysGrid.appendChild(button);
  });
  
  const keysInUse = state.clients.filter((client) => client.status === 'em uso').length;
  const totalKeys = state.clients.length;
  keysInUseInfo.textContent = `Chaves em uso: ${keysInUse} de ${totalKeys}`;
}

function openKeyModal(client) {
  activeModalClientId = client.id;
  state.activeKeyId = client.id;
  let shouldSave = false;
  const isNewAccount = client.status === 'livre';

  if (isNewAccount) {
    client.status = 'em uso';
    client.name = `Chave ${client.ficha}`;
    shouldSave = true;
  }

  if (chargeEntryFeeAtEntry(client, isNewAccount)) {
    shouldSave = true;
  }

  if (shouldSave) {
    saveState();
  }

  keyModal.classList.remove('hidden');
  modalKeyTitle.textContent = `Chave ${client.ficha}`;
  closeAccountBtn.classList.toggle('hidden', client.status !== 'em uso');
  renderKeyPanel();
  renderModalProductOptions();
  renderModalSales();
}

function chargeEntryFeeAtEntry(client, isNewAccount) {
  const entryFeeItem = getEntryFeeItem();
  const entryFee = Number(entryFeeItem?.price);
  const entryFeePurchases = state.purchases.filter(
    (purchase) => purchase.clientId === client.id && purchase.itemId === 'entry-fee'
  );
  const pendingEntryFee = entryFeePurchases.find(
    (purchase) => purchase.clientId === client.id && purchase.itemId === 'entry-fee' && !purchase.closedAt
  );

  if (pendingEntryFee) return false;

  const missingEntryFeeForOpenAccount = !isNewAccount && entryFeePurchases.length === 0;
  if ((!isNewAccount && !missingEntryFeeForOpenAccount) || entryFee <= 0) return false;

  state.purchases.push({
    id: crypto.randomUUID(),
    clientId: client.id,
    itemId: 'entry-fee',
    itemName: entryFeeItem.name,
    quantity: 1,
    total: entryFee,
    createdAt: new Date().toISOString()
  });
  return true;
}

function closeKeyModal() {
  activeModalClientId = null;
  keyModal.classList.add('hidden');
}

function renderModalProductOptions() {
  modalProductSelect.innerHTML = '';
  state.items.filter((item) => item.id !== 'entry-fee').forEach((item) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = `${item.name} (${formatCurrency(item.price)})`;
    modalProductSelect.appendChild(option);
  });
}

function renderModalSales() {
  modalSalesList.innerHTML = '';
  if (!activeModalClientId) {
    return;
  }
  const purchases = window.BebidasLogic.getClientPurchases(activeModalClientId, state.purchases);
  purchases.forEach((purchase) => {
    const item = state.items.find((entry) => entry.id === purchase.itemId);
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${purchase.itemName || item?.name || 'Produto'} x${purchase.quantity}`;
    const value = document.createElement('span');
    value.textContent = formatCurrency(purchase.total);
    li.appendChild(label);
    li.appendChild(value);
    if (purchase.itemId !== 'entry-fee') {
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'ghost-btn';
      removeButton.textContent = 'Remover';
      removeButton.addEventListener('click', () => {
        removePurchase(purchase.id);
      });
      li.appendChild(removeButton);
    }
    modalSalesList.appendChild(li);
  });
}

loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  const matchedUser = state.users.find((user) => user.login === username && user.password === password);
  if (matchedUser) {
    state.loggedIn = true;
    state.activeSection = 'cadastro';
    saveState();
    render();
  } else {
    alert('Credenciais inválidas.');
  }
});

logoutBtn.addEventListener('click', () => {
  state.loggedIn = false;
  saveState();
  render();
});

navigationButtons.forEach((button) => {
  button.addEventListener('click', () => setActiveSection(button.dataset.section));
});

userForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = userNameInput.value.trim();
  const login = userLoginInput.value.trim();
  const password = userPasswordInput.value;

  if (!name || !login || !password) {
    alert('Preencha todos os campos do usuário.');
    return;
  }

  const otherUserWithLogin = state.users.find((user) => user.login === login);
  if (otherUserWithLogin) {
    alert('Já existe um usuário com esse login.');
    return;
  }

  state.users.push({
    id: crypto.randomUUID(),
    name,
    login,
    password
  });

  saveState();
  resetUserForm();
  render();
});

userCancelEditBtn.addEventListener('click', () => {
  resetUserForm();
});

changePasswordForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!currentPasswordUserId) {
    return;
  }
  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmNewPasswordInput.value;
  if (!newPassword || newPassword !== confirmPassword) {
    alert('As senhas devem ser iguais.');
    return;
  }

  const user = state.users.find((entry) => entry.id === currentPasswordUserId);
  if (user) {
    user.password = newPassword;
    saveState();
    closeChangePassword();
    render();
  }
});

closeChangePasswordBtn.addEventListener('click', closeChangePassword);
changePasswordBackdrop.addEventListener('click', closeChangePassword);

editUserForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!currentEditedUserId) {
    return;
  }
  const name = editUserName.value.trim();
  const login = editUserLogin.value.trim();
  const password = editUserPassword.value;

  if (!name || !login || !password) {
    alert('Preencha todos os campos.');
    return;
  }

  const otherUserWithLogin = state.users.find((user) => user.login === login && user.id !== currentEditedUserId);
  if (otherUserWithLogin) {
    alert('Já existe um usuário com esse login.');
    return;
  }

  const user = state.users.find((entry) => entry.id === currentEditedUserId);
  if (user) {
    user.name = name;
    user.login = login;
    user.password = password;
    saveState();
    closeEditUser();
    render();
  }
});

closeEditUserBtn.addEventListener('click', closeEditUser);
editUserBackdrop.addEventListener('click', closeEditUser);

relatorioForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const startDate = relatorioStartDate.value;
  const endDate = relatorioEndDate.value;
  if (startDate > endDate) {
    alert('A data inicial não pode ser posterior à data final.');
    return;
  }
  gerarRelatorio(startDate, endDate);
});

function gerarRelatorio(startDate, endDate) {

  const dayPurchases = state.purchases.filter((purchase) => {
    const paymentDate = purchase.closedAt && getLocalDateKey(purchase.closedAt);
    return paymentDate && paymentDate >= startDate && paymentDate <= endDate;
  });

  const productSales = {};
  let totalRevenue = 0;
  let keyRevenue = 0;
  let consumableRevenue = 0;

  dayPurchases.forEach((purchase) => {
    const item = state.items.find((i) => i.id === purchase.itemId);
    const productName = purchase.itemName || item?.name || 'Produto removido';
    if (!productSales[productName]) {
      productSales[productName] = { quantity: 0, total: 0 };
    }
    productSales[productName].quantity += purchase.quantity;
    productSales[productName].total += purchase.total;
    totalRevenue += purchase.total;
    if (purchase.itemId === 'entry-fee') {
      keyRevenue += purchase.total;
    } else {
      consumableRevenue += purchase.total;
    }
  });

  renderRelatorio(startDate, endDate, productSales, keyRevenue, consumableRevenue, totalRevenue);
}

function renderRelatorio(startDate, endDate, productSales, keyRevenue, consumableRevenue, totalRevenue) {
  const formattedStartDate = new Date(startDate + 'T00:00:00').toLocaleDateString('pt-BR');
  const formattedEndDate = new Date(endDate + 'T00:00:00').toLocaleDateString('pt-BR');
  const isSingleDay = startDate === endDate;
  relatorioResultDate.textContent = isSingleDay
    ? `do dia ${formattedStartDate}`
    : `de ${formattedStartDate} a ${formattedEndDate}`;
  relatorioSummaryTitle.textContent = isSingleDay ? 'Resumo do dia' : 'Resumo do período';

  relatorioProducts.innerHTML = '';
  if (Object.keys(productSales).length === 0) {
    relatorioProducts.innerHTML = '<p style="color: #999;">Nenhuma venda neste dia.</p>';
  } else {
    Object.entries(productSales).forEach(([productName, data]) => {
      const div = document.createElement('div');
      div.style.cssText = 'margin-bottom: 12px; padding: 12px; background: #f5f5f5; border-radius: 6px;';
      div.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 4px;">${productName}</div>
        <div style="font-size: 14px; color: #666;">Quantidade: ${data.quantity} unidades</div>
        <div style="font-size: 14px; color: #666;">Total: ${formatCurrency(data.total)}</div>
      `;
      relatorioProducts.appendChild(div);
    });
  }

  relatorioSummary.innerHTML = `
    <div style="margin-bottom: 12px; padding: 12px; background: #f5f5f5; border-radius: 6px;">
      <div style="margin-bottom: 8px;"><strong>Total de chaves vendidas:</strong> ${formatCurrency(keyRevenue)}</div>
      <div style="margin-bottom: 8px;"><strong>Total de produtos consumíveis:</strong> ${formatCurrency(consumableRevenue)}</div>
      <div><strong>Receita total:</strong> ${formatCurrency(totalRevenue)}</div>
    </div>
  `;

  relatorioResult.classList.remove('hidden');
  exportPdfBtn.classList.remove('hidden');
}

exportPdfBtn.addEventListener('click', () => window.print());

itemForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const itemName = document.getElementById('itemName').value.trim();
  const itemPrice = Number(document.getElementById('itemPrice').value);
  const itemStock = Number(document.getElementById('itemStock').value);

  if (!itemName || itemPrice < 0 || itemStock < 0) {
    alert('Preencha os dados corretamente.');
    return;
  }

  const normalizedName = itemName.toLowerCase();
  const existingItem = state.items.find((entry) => entry.name.toLowerCase() === normalizedName);

  if (existingItem) {
    existingItem.stock += itemStock;
    existingItem.price = itemPrice;
  } else {
    state.items.push({
      id: crypto.randomUUID(),
      name: itemName,
      price: itemPrice,
      stock: itemStock
    });
  }

  saveState();
  render();
  itemForm.reset();
});


modalProductForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const productId = modalProductSelect.value;
  const quantity = Number(modalProductQuantity.value);
  const client = state.clients.find((entry) => entry.id === activeModalClientId);
  const item = state.items.find((entry) => entry.id === productId);

  if (!client) {
    alert('Cliente não encontrado.');
    return;
  }

  if (!item || quantity <= 0) {
    alert('Selecione um produto e uma quantidade válidos.');
    return;
  }

  if (item.stock < quantity) {
    alert('Estoque insuficiente.');
    return;
  }

  if (client.status !== 'em uso') {
    client.status = 'em uso';
    client.name = `Chave ${client.ficha}`;
    state.activeKeyId = client.id;
  }

  item.stock -= quantity;
  state.purchases.push({
    id: crypto.randomUUID(),
    clientId: client.id,
    itemId: item.id,
    itemName: item.name,
    quantity,
    total: item.price * quantity,
    createdAt: new Date().toISOString()
  });

  saveState();
  render();
  renderModalSales();
});

closeModalBtn.addEventListener('click', closeKeyModal);
modalBackdrop.addEventListener('click', closeKeyModal);
confirmBackdrop.addEventListener('click', closeConfirmModal);
confirmCancelBtn.addEventListener('click', closeConfirmModal);
confirmOkBtn.addEventListener('click', () => {
  if (typeof currentConfirmAction === 'function') {
    currentConfirmAction();
  }
  closeConfirmModal();
});
closeEditItemBtn.addEventListener('click', closeEditItemModal);
editItemBackdrop.addEventListener('click', closeEditItemModal);
closeEditEntryFeeBtn.addEventListener('click', closeEditEntryFeeModal);
editEntryFeeBackdrop.addEventListener('click', closeEditEntryFeeModal);

editItemForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!activeEditItemId) {
    return;
  }

  const item = state.items.find((entry) => entry.id === activeEditItemId);
  if (!item) {
    return;
  }

  const updatedName = editItemName.value.trim();
  const updatedPrice = Number(editItemPrice.value);
  const addedStock = Number(editAddStock.value);

  if (!updatedName || updatedPrice < 0 || addedStock < 0) {
    alert('Preencha os dados corretamente.');
    return;
  }

  item.name = updatedName;
  item.price = updatedPrice;
  item.stock += addedStock;

  saveState();
  render();
  renderModalProductOptions();
  closeEditItemModal();
});

editEntryFeeForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const entryFee = Number(editEntryFeeInput.value);
  if (entryFee < 0) {
    alert('Informe um preço válido para a chave.');
    return;
  }
  const entryFeeItem = getEntryFeeItem();
  if (!entryFeeItem) {
    alert('Produto Chave não encontrado. Recarregue a página e tente novamente.');
    return;
  }
  entryFeeItem.price = entryFee;
  saveState();
  render();
  closeEditEntryFeeModal();
});

function openConfirmModal(title, message, total, onConfirm) {
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmTotal.textContent = total;
  currentConfirmAction = onConfirm;
  confirmModal.classList.remove('hidden');
}

function closeConfirmModal() {
  currentConfirmAction = null;
  confirmModal.classList.add('hidden');
}

function openEditItemModal(itemId) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) {
    return;
  }

  activeEditItemId = itemId;
  editItemTitle.textContent = `Editar ${item.name}`;
  editItemCurrentStock.textContent = `Estoque atual: ${item.stock}`;
  editItemName.value = item.name;
  editItemPrice.value = item.price;
  editAddStock.value = '0';
  editItemModal.classList.remove('hidden');
}

function closeEditItemModal() {
  activeEditItemId = null;
  editItemModal.classList.add('hidden');
}

function openEditEntryFeeModal() {
  editEntryFeeInput.value = getEntryFeeItem()?.price || 0;
  editEntryFeeModal.classList.remove('hidden');
}

function closeEditEntryFeeModal() {
  editEntryFeeModal.classList.add('hidden');
}

function getEntryFeeItem() {
  return state.items.find((item) => item.id === 'entry-fee');
}

function removePurchase(purchaseId) {
  const purchase = state.purchases.find((entry) => entry.id === purchaseId);
  if (purchase) {
    const item = state.items.find((entry) => entry.id === purchase.itemId);
    if (item) {
      item.stock += purchase.quantity;
    }
  }
  state.purchases = state.purchases.filter((purchase) => purchase.id !== purchaseId);
  saveState();
  render();
  renderModalSales();
}

closeAccountBtn.addEventListener('click', () => {
  if (!activeModalClientId) {
    return;
  }

  const client = state.clients.find((entry) => entry.id === activeModalClientId);
  const total = window.BebidasLogic.getClientTotal(activeModalClientId, state.purchases);
  openConfirmModal(
    'Fechar conta',
    `Fechar conta de ${client?.name || 'cliente'}?`,
    `Total a pagar: ${formatCurrency(total)}`,
    () => {
      window.BebidasLogic.closeClientAccount(state, activeModalClientId);
      state.activeKeyId = null;
      saveState();
      render();
      closeKeyModal();
    }
  );
});

loadState();
