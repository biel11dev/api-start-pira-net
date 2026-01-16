# API Start Pira Net

Backend para sistema de pedidos online - API RESTful com Prisma e PostgreSQL

## 🚀 Tecnologias

- Node.js
- Express
- Prisma ORM
- PostgreSQL
- CORS
- dotenv

## 📦 Instalação

```bash
npm install
```

## ⚙️ Configuração

1. Crie um arquivo `.env` na raiz do projeto com base no `.env.example`:

```env
DATABASE_URL="postgresql://usuario:senha@localhost:5432/startpira_db?schema=public"
PORT=3001
WHATSAPP_NUMBER=5511999999999
```

2. Execute as migrações do Prisma:

```bash
npx prisma migrate dev --name init
```

3. (Opcional) Popule o banco com dados de exemplo:

```bash
npm run prisma:seed
```

4. Gere o Prisma Client:

```bash
npx prisma generate
```

## 🏃 Execução

### Modo desenvolvimento (com watch)
```bash
npm run dev
```

### Modo produção
```bash
npm start
```

## 🌐 Endpoints

### Categorias
- `GET /api/categories` - Lista categorias principais
- `GET /api/categories/all` - Lista todas categorias
- `GET /api/categories/:id` - Busca categoria por ID
- `POST /api/categories` - Cria categoria
- `PUT /api/categories/:id` - Atualiza categoria
- `DELETE /api/categories/:id` - Exclui categoria

### Produtos
- `GET /api/products` - Lista produtos
- `GET /api/products/:id` - Busca produto por ID
- `GET /api/cardapio` - Lista cardápio formatado
- `POST /api/products` - Cria produto
- `PUT /api/products/:id` - Atualiza produto
- `PUT /api/products/:id/disponibilidade` - Atualiza disponibilidade
- `DELETE /api/products/:id` - Exclui produto

### Pedidos
- `GET /api/orders` - Lista pedidos
- `GET /api/orders/:id` - Busca pedido por ID
- `POST /api/pedido` - Cria pedido e gera link WhatsApp
- `PUT /api/orders/:id/status` - Atualiza status do pedido

### Sugestões
- `GET /api/sugestoes` - Lista sugestões
- `POST /api/sugestoes` - Cria sugestão
- `DELETE /api/sugestoes/:id` - Remove sugestão

### Auxiliares
- `GET /health` - Health check

## 📝 Estrutura

```
api-start-pira-net/
├── prisma/
│   ├── schema.prisma
│   └── seed.js
├── server.js
├── package.json
├── .env
└── README.md
```

## 🗄️ Comandos Prisma

```bash
# Gerar Client
npx prisma generate

# Criar migração
npx prisma migrate dev

# Abrir Prisma Studio
npx prisma studio

# Executar seed
npm run prisma:seed
```
├── server.js          # Servidor Express
├── package.json       # Dependências
├── .env              # Variáveis de ambiente
└── README.md         # Documentação
```
