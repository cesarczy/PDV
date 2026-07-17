# PDV — Sistema de Vendas de Bebidas

Aplicação web simples para controlar vendas, produtos, estoque, chaves e usuários. O projeto usa Python no servidor, SQLite para persistência e HTML, CSS e JavaScript puro na interface.

## Recursos

- Login de administradores.
- Cadastro e edição de produtos, preços e estoque.
- Controle de chaves em uso e livres.
- Registro de compras por chave.
- Relatórios de vendas.
- Dados persistidos localmente em SQLite.

## Estrutura do projeto

```text
PDV/
├── pdv_front/          # Interface web
│   ├── index.html
│   ├── styles.css
│   ├── logic.js
│   └── app.js
├── pdv_back/           # Servidor e banco de dados
│   ├── server.py
│   └── data.db
├── server.py            # Inicializador do projeto
└── README.md
```

## Como executar

### Pré-requisito

- Python 3 instalado.

Na raiz do projeto, inicie o servidor:

```sh
python3 server.py
```

Para usar outra porta:

```sh
python3 server.py 8080
```

Depois, abra no navegador:

```text
http://localhost:8000
```

Se informar outra porta, substitua `8000` pelo número escolhido.

## Acesso inicial

| Campo | Valor |
| --- | --- |
| Usuário | `admin` |
| Senha | `admin123` |

> Altere a senha padrão após o primeiro acesso.

## Dados

O banco de dados fica em `pdv_back/data.db`. Ele é criado e atualizado automaticamente pelo servidor. Para reiniciar os dados locais, pare o servidor e faça uma cópia ou remova esse arquivo antes de iniciá-lo novamente.

## Desenvolvimento

O backend também pode ser iniciado diretamente:

```sh
python3 pdv_back/server.py
```

O servidor publica os arquivos de `pdv_front/` e disponibiliza a API em `/api/state`.
