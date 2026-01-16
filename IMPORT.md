# Importação de Produtos

## 📦 Como Importar Produtos da API Externa

### Opção 1: Via Script (Recomendado)

Execute o script de importação:

```bash
npm run import:products
```

Este comando irá:
- ✅ Buscar todos os produtos de `https://api-start-pira.vercel.app/api/products`
- ✅ Criar/atualizar unidades de medida automaticamente
- ✅ Criar/atualizar categorias e subcategorias
- ✅ Importar ou atualizar produtos no banco de dados
- ✅ Mostrar relatório detalhado da importação

### Opção 2: Via API Endpoint

Faça uma requisição POST para o endpoint:

```bash
POST http://localhost:3001/api/import/products
```

Exemplo com curl:
```bash
curl -X POST http://localhost:3001/api/import/products
```

Resposta esperada:
```json
{
  "success": true,
  "message": "Importação concluída",
  "imported": 50,
  "updated": 10,
  "total": 60,
  "errors": []
}
```

## 📊 Endpoints de Unidades de Medida

### Listar todas as unidades
```
GET /api/unit-measures
```

### Criar nova unidade
```
POST /api/unit-measures
Content-Type: application/json

{
  "name": "FD (12)",
  "abbreviation": "FD12",
  "description": "Fardo com 12 unidades"
}
```

### Atualizar unidade
```
PUT /api/unit-measures/:id
Content-Type: application/json

{
  "name": "FD (12)",
  "description": "Fardo com 12 unidades"
}
```

### Excluir unidade
```
DELETE /api/unit-measures/:id
```

### Estatísticas por unidade
```
GET /api/stats/by-unit
```

Retorna estatísticas agrupadas por unidade de medida:
```json
[
  {
    "unit": "FD (12)",
    "count": 25,
    "totalQuantity": 150,
    "avgPrice": 35.50,
    "avgCostPrice": 28.00,
    "totalValue": 5325.00
  }
]
```

## 🔄 Sincronização Automática

Para manter os dados atualizados, você pode:

1. **Executar manualmente** quando necessário:
```bash
npm run import:products
```

2. **Criar um cron job** para sincronizar periodicamente (exemplo: diariamente)

3. **Usar o endpoint da API** para integração com outros sistemas

## ⚙️ Como Funciona

A importação segue esta lógica:

1. **Unidades de Medida**: Extrai todas as unidades únicas (FD (12), Kg, Litro, etc.) e as registra
2. **Categorias Principais**: Cria categorias principais (BEBIDAS, DOCES, etc.)
3. **Subcategorias**: Cria subcategorias vinculadas às principais (REFRIGERANTE → BEBIDAS)
4. **Produtos**: 
   - Se o produto já existe (pelo nome), ele é **atualizado**
   - Se não existe, ele é **criado**
   - Mantém referência à categoria e unidade de medida

## 📝 Estrutura dos Dados Importados

Cada produto importado terá:
- `name`: Nome do produto
- `description`: Descrição (inclui a unidade)
- `price`: Preço de venda (campo `value` da API externa)
- `costPrice`: Preço de custo (campo `valuecusto` da API externa)
- `quantity`: Quantidade em estoque
- `unit`: Unidade de medida
- `categoryId`: Referência à categoria
- `available`: true (sempre disponível na importação)

## 🛠️ Troubleshooting

### Erro de conexão
- Verifique se a API externa está acessível
- Teste: `curl https://api-start-pira.vercel.app/api/products`

### Erro de duplicação
- A importação usa `upsert` para evitar duplicações
- Produtos são identificados pelo **nome**

### Categorias não criadas
- Verifique se os produtos têm o campo `category` na API externa
- A estrutura hierárquica é mantida (parent → subcategory)
