require("dotenv").config();
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { PrismaClient } = require("@prisma/client");
const { format, parse } = require("date-fns");
const nodemailer = require("nodemailer");
const prisma = new PrismaClient();
const app = express();
const port = 3000;
const SECRET_KEY = process.env.SECRET_KEY || "2a51f0c6b96167b01f59b41aa2407066735cc39ee71ebd041d8ff59b75c60c15";
const path = require("path");

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", "https://api-start-pira.vercel.app"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
      },
    },
  })
);
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));



async function sendResetEmail(email, token) {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const resetLink = `https://start-pira-ftd.vercel.app/reset-password?token=${token}`;

  const mailOptions = {
    from: '"Start Pira" <startpira01@gmail.com>',
    to: email,
    subject: "Redefinição de Senha - Start Pira",
    text: `Olá,

Você solicitou a redefinição de sua senha. Use o link abaixo para redefini-la:

${resetLink}

Se você não solicitou isso, ignore este e-mail.

Atenciosamente,
Equipe Start Pira`,
    html: `<p>Olá,</p>
           <p>Você solicitou a redefinição de sua senha. Use o link abaixo para redefini-la:</p>
           <a href="${resetLink}">Redefinir Senha</a>
           <p>Se você não solicitou isso, ignore este e-mail.</p>
           <p>Atenciosamente,<br>Equipe Start Pira</p>`,
  };

  await transporter.sendMail(mailOptions);
  console.log(`E-mail de redefinição enviado para ${email}`);
}


// ROTAS DE COMPRAS (PURCHASES)
app.get("/api/purchases", async (req, res) => res.json(await prisma.purchase.findMany()));

app.get("/api/purchases/:id", async (req, res) => {
  const purchase = await prisma.purchase.findUnique({
    where: { id: parseInt(req.params.id) },
  });
  res.json(purchase || { error: "Compra não encontrada" });
});

app.post("/api/purchases", async (req, res) => {
  try {
    const { product, quantity, total, date, clientId } = req.body;

    // Converter quantity para um número inteiro
    const parsedQuantity = parseInt(quantity, 10);
    if (isNaN(parsedQuantity)) {
      return res.status(400).json({ error: "Quantidade deve ser um número válido." });
    }

    const newPurchase = await prisma.purchase.create({
      data: { product, quantity: parsedQuantity, total, date, clientId },
    });

    res.status(201).json(newPurchase);
  } catch (error) {
    res.status(500).json({ error: "Erro ao criar compra", details: error.message });
  }
});

app.put("/api/purchases/:id", async (req, res) => {
  try {
    const { product, quantity, total, date, clientId } = req.body;

    // Converter quantity para um número inteiro
    const parsedQuantity = parseInt(quantity, 10);
    if (isNaN(parsedQuantity)) {
      return res.status(400).json({ error: "Quantidade deve ser um número válido." });
    }

    const updatedPurchase = await prisma.purchase.update({
      where: { id: parseInt(req.params.id) },
      data: { product, quantity: parsedQuantity, total, date, clientId },
    });

    res.json(updatedPurchase);
  } catch (error) {
    res.status(500).json({ error: "Erro ao atualizar compra", details: error.message });
  }
});

app.delete("/api/purchases/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    await prisma.purchase.delete({ where: { id } });
    res.json({ message: "Compra excluída com sucesso" });
  } catch (error) {
    res.status(500).json({ error: "Erro ao excluir compra", details: error.message });
  }
});

// ROTAS DE PAGAMENTOS
app.get("/api/payments", async (req, res) => res.json(await prisma.payment.findMany()));

app.get("/api/payments/:id", async (req, res) => {
  const payment = await prisma.payment.findUnique({
    where: { id: parseInt(req.params.id) },
  });
  res.json(payment || { error: "Pagamento não encontrado" });
});

app.post("/api/payments", async (req, res) => res.json(await prisma.payment.create({ data: req.body })));

app.put("/api/payments/:id", async (req, res) => {
  try {
    const { amount, date, clientId } = req.body;

    const formattedDate = new Date(date).toISOString();

    const updatedPayment = await prisma.payment.update({
      where: { id: parseInt(req.params.id) },
      data: { amount, date: formattedDate, clientId },
    });

    res.json(updatedPayment);
  } catch (error) {
    res.status(500).json({ error: "Erro ao atualizar pagamento", details: error.message });
  }
});

app.delete("/api/payments/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    await prisma.payment.delete({ where: { id } });
    res.json({ message: "Pagamento excluído com sucesso" });
  } catch (error) {
    res.status(500).json({ error: "Erro ao excluir pagamento", details: error.message });
  }
});

// ROTAS DE LEITURAS DIÁRIAS
app.get("/api/daily-readings", async (req, res) => {
  const { machineId, date } = req.query;

  let whereClause = {
    machineId: parseInt(machineId),
  };

  if (date) {
    // Parse a data de entrada e formate-a como "dd-MM-yyyy"
    whereClause.date = { contains: date };
  }

  try {
    const dailyReadings = await prisma.dailyReading.findMany({
      where: whereClause,
    });
    res.json(dailyReadings);
  } catch (error) {
    console.error("Erro ao buscar leituras diárias:", error);
    res.status(500).json({ message: "Erro ao buscar leituras diárias" });
  }
});

app.get("/api/daily-readings/:id", async (req, res) => {
  const dailyReading = await prisma.dailyReading.findUnique({
    where: { id: parseInt(req.params.id) },
  });
  res.json(dailyReading || { error: "Leitura diária não encontrada" });
});

app.post("/api/daily-readings", async (req, res) => {
  const { date, value, machineId } = req.body;
  res.json(await prisma.dailyReading.create({ data: { date: date, value, machineId } }));
});

app.put("/api/daily-readings/:id", async (req, res) => {
  try {
    const { date, value, machineId } = req.body;
    const formattedDate = format(date, "dd-MM-yyyy"); // Formata a data para "dd-MM-yyyy"

    const updatedDailyReading = await prisma.dailyReading.update({
      where: { id: parseInt(req.params.id) },
      data: { date: formattedDate, value, machineId },
    });

    res.json(updatedDailyReading);
  } catch (error) {
    res.status(500).json({ error: "Erro ao atualizar leitura diária", details: error.message });
  }
});

app.delete("/api/daily-readings/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    await prisma.dailyReading.delete({ where: { id } });
    res.json({ message: "Leitura diária excluída com sucesso" });
  } catch (error) {
    res.status(500).json({ error: "Erro ao excluir leitura diária", details: error.message });
  }
});

// ROTAS DE PRODUTOS (CORREÇÃO DO ERRO `quantity`)
app.get("/api/estoque_prod", async (req, res) => res.json(await prisma.estoque.findMany()));

app.get("/api/estoque_prod/:id", async (req, res) => {
  const product = await prisma.estoque.findUnique({
    where: { id: parseInt(req.params.id) },
  });
  res.json(product || { error: "Produto não encontrado" });
});

app.post("/api/estoque_prod", async (req, res) => {
  try {
    const { name, quantity, unit, value, valuecusto } = req.body;

    if (!name || !quantity || !unit) {
      return res.status(400).json({ error: "Todos os campos são obrigatórios." });
    }

    const parsedQuantity = parseInt(quantity, 10);
    if (isNaN(parsedQuantity)) {
      return res.status(400).json({ error: "Quantidade deve ser um número válido." });
    }

    const parsedValue = parseFloat(value, 10);
    if (isNaN(parsedValue)) {
      return res.status(400).json({ error: "Valor deve ser um número válido." });
    }

    const parsedValueCusto = parseFloat(valuecusto, 10);
    if (isNaN(parsedValueCusto)) {
      return res.status(400).json({ error: "Custo deve ser um número válido." });
    }

    const newProduct = await prisma.estoque.create({
      data: { name, quantity: parsedQuantity, unit, value: parsedValue, valuecusto: parsedValueCusto },
    });

    res.status(201).json(newProduct);
  } catch (error) {
    res.status(500).json({ error: "Erro ao criar produto", details: error.message });
  }
});

app.put("/api/estoque_prod/:id", async (req, res) => {
  try {
    const { name, quantity, unit, value, valuecusto } = req.body;

    if (!name || !quantity || !unit) {
      return res.status(400).json({ error: "Todos os campos são obrigatórios." });
    }

    const parsedQuantity = parseInt(quantity, 10);
    if (isNaN(parsedQuantity)) {
      return res.status(400).json({ error: "Quantidade deve ser um número válido." });
    }

    const parsedValue = parseFloat(value, 10);
    if (isNaN(parsedValue)) {
      return res.status(400).json({ error: "Valor deve ser um número válido." });
    }

    const parsedValueCusto = parseFloat(valuecusto, 10);
    if (isNaN(parsedValueCusto)) {
      return res.status(400).json({ error: "Custo deve ser um número válido." });
    }

    const updatedProduct = await prisma.estoque.update({
      where: { id: parseInt(req.params.id) },
      data: { name, quantity: parsedQuantity, unit, value: parsedValue, valuecusto: parsedValueCusto },
    });

    res.json(updatedProduct);
  } catch (error) {
    res.status(500).json({ error: "Erro ao atualizar produto", details: error.message });
  }
});

app.delete("/api/estoque_prod/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    await prisma.estoque.delete({ where: { id } });
    res.json({ message: "Produto excluído com sucesso" });
  } catch (error) {
    res.status(500).json({ error: "Erro ao excluir produto", details: error.message });
  }
});
// ROTAS DE PRODUTOS (CORREÇÃO DO ERRO `quantity`)
app.get("/api/products", async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      include: { 
        category: {
          include: {
            parent: true
          }
        }
      }
    });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar produtos", details: error.message });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { 
        category: {
          include: {
            parent: true
          }
        }
      }
    });
    res.json(product || { error: "Produto não encontrado" });
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar produto", details: error.message });
  }
});

// Atualizar POST e PUT de produtos para incluir categoria com parent no retorno
app.post("/api/products", async (req, res) => {
  try {
    const { name, quantity, unit, value, valuecusto, categoryId } = req.body;

    if (!name || !quantity || !unit) {
      return res.status(400).json({ error: "Todos os campos são obrigatórios." });
    }

    const parsedQuantity = parseInt(quantity, 10);
    if (isNaN(parsedQuantity)) {
      return res.status(400).json({ error: "Quantidade deve ser um número válido." });
    }

    const parsedValue = parseFloat(value, 10);
    if (isNaN(parsedValue)) {
      return res.status(400).json({ error: "Valor deve ser um número válido." });
    }

    const parsedValueCusto = parseFloat(valuecusto, 10);
    if (isNaN(parsedValueCusto)) {
      return res.status(400).json({ error: "Custo deve ser um número válido." });
    }

    const newProduct = await prisma.product.create({
      data: { 
        name, 
        quantity: parsedQuantity, 
        unit, 
        value: parsedValue, 
        valuecusto: parsedValueCusto,
        categoryId: categoryId || null
      },
      include: { 
        category: {
          include: {
            parent: true
          }
        }
      }
    });

    res.status(201).json(newProduct);
  } catch (error) {
    res.status(500).json({ error: "Erro ao criar produto", details: error.message });
  }
});

app.put("/api/products/:id", async (req, res) => {
  try {
    const { name, quantity, unit, value, valuecusto, categoryId } = req.body;

    if (!name || !quantity || !unit) {
      return res.status(400).json({ error: "Todos os campos são obrigatórios." });
    }

    const parsedQuantity = parseInt(quantity, 10);
    if (isNaN(parsedQuantity)) {
      return res.status(400).json({ error: "Quantidade deve ser um número válido." });
    }

    const parsedValue = parseFloat(value, 10);
    if (isNaN(parsedValue)) {
      return res.status(400).json({ error: "Valor deve ser um número válido." });
    }

    const parsedValueCusto = parseFloat(valuecusto, 10);
    if (isNaN(parsedValueCusto)) {
      return res.status(400).json({ error: "Custo deve ser um número válido." });
    }

    const updatedProduct = await prisma.product.update({
      where: { id: parseInt(req.params.id) },
      data: { 
        name, 
        quantity: parsedQuantity, 
        unit, 
        value: parsedValue, 
        valuecusto: parsedValueCusto,
        categoryId: categoryId || null
      },
      include: { 
        category: {
          include: {
            parent: true
          }
        }
      }
    });

    res.json(updatedProduct);
  } catch (error) {
    res.status(500).json({ error: "Erro ao atualizar produto", details: error.message });
  }
});

app.delete("/api/products/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    await prisma.product.delete({ where: { id } });
    res.json({ message: "Produto excluído com sucesso" });
  } catch (error) {
    res.status(500).json({ error: "Erro ao excluir produto", details: error.message });
  }
});


// GET /api/categories - Listar categorias com subcategorias
app.get("/api/categories", async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: { parentId: null }, // Só categorias principais
      include: {
        subcategories: {
          include: {
            products: true,
            prod_estoq: true
          }
        },
        products: true,
        prod_estoq: true
      },
    });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar categorias", details: error.message });
  }
});

// GET /api/categories/all - Listar todas as categorias (incluindo subcategorias)
app.get("/api/categories/all", async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        parent: true,
        subcategories: true,
        products: true,
        prod_estoq: true
      },
    });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar todas as categorias", details: error.message });
  }
});

// POST /api/categories - Criar categoria ou subcategoria
app.post("/api/categories", async (req, res) => {
  try {
    const { name, parentId } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: "Nome da categoria é obrigatório" });
    }

    const data = { name: name.trim() };
    if (parentId && !isNaN(parseInt(parentId))) {
      // Verificar se a categoria pai existe
      const parentCategory = await prisma.category.findUnique({
        where: { id: parseInt(parentId) }
      });
      
      if (!parentCategory) {
        return res.status(404).json({ error: "Categoria pai não encontrada" });
      }
      
      data.parentId = parseInt(parentId);
    }

    const category = await prisma.category.create({ 
      data,
      include: {
        parent: true,
        subcategories: true
      }
    });
    
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ error: "Erro ao criar categoria", details: error.message });
  }
});

// PUT /api/categories/:id - Atualizar categoria
app.put("/api/categories/:id", async (req, res) => {
  try {
    const { name, parentId } = req.body;
    const categoryId = parseInt(req.params.id);
    
    if (isNaN(categoryId)) {
      return res.status(400).json({ error: "ID da categoria inválido" });
    }

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: "Nome da categoria é obrigatório" });
    }

    const data = { name: name.trim() };
    
    if (parentId !== undefined) {
      if (parentId === null || parentId === '') {
        data.parentId = null;
      } else {
        const parentIdNum = parseInt(parentId);
        if (parentIdNum === categoryId) {
          return res.status(400).json({ error: "Uma categoria não pode ser pai de si mesma" });
        }
        
        // Verificar se a categoria pai existe
        const parentCategory = await prisma.category.findUnique({
          where: { id: parentIdNum }
        });
        
        if (!parentCategory) {
          return res.status(404).json({ error: "Categoria pai não encontrada" });
        }
        
        data.parentId = parentIdNum;
      }
    }

    const updatedCategory = await prisma.category.update({
      where: { id: categoryId },
      data,
      include: {
        parent: true,
        subcategories: true
      }
    });

    res.json(updatedCategory);
  } catch (error) {
    res.status(500).json({ error: "Erro ao atualizar categoria", details: error.message });
  }
});

// DELETE /api/categories/:id - Excluir categoria (substitua a existente)
app.delete("/api/categories/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    // Verificar se a categoria tem subcategorias
    const subcategories = await prisma.category.findMany({
      where: { parentId: id }
    });

    if (subcategories.length > 0) {
      return res.status(400).json({ 
        error: "Não é possível excluir uma categoria que possui subcategorias. Exclua primeiro as subcategorias." 
      });
    }

    // Verificar se a categoria tem produtos associados
    const productsCount = await prisma.product.count({
      where: { categoryId: id }
    });

    const estoqueCount = await prisma.estoque.count({
      where: { categoria_Id: id }
    });

    if (productsCount > 0 || estoqueCount > 0) {
      return res.status(400).json({ 
        error: "Não é possível excluir uma categoria que possui produtos associados." 
      });
    }

    await prisma.category.delete({ where: { id } });
    res.json({ message: "Categoria excluída com sucesso" });
  } catch (error) {
    res.status(500).json({ error: "Erro ao excluir categoria", details: error.message });
  }
});

// Rota para criar uma nova venda (PDV)
app.post('/api/sales', async (req, res) => {
  try {
    const { items, total, paymentMethod, customerName, amountReceived, change, date } = req.body;
    
    // Criar registro da venda
    const sale = await prisma.sale.create({
      data: {
        total: parseFloat(total),
        paymentMethod,
        customerName,
        amountReceived: parseFloat(amountReceived) || total,
        change: parseFloat(change) || 0,
        date: parseISO(date),
        items: {
          create: items.map(item => ({
            productId: item.id,
            productName: item.name,
            quantity: item.quantity,
            unitPrice: item.price,
            total: item.price * item.quantity
          }))
        }
      },
      include: {
        items: true
      }
    });

    res.status(201).json(sale);
  } catch (error) {
    console.error('Erro ao criar venda:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota para buscar vendas
app.get('/api/sales', async (req, res) => {
  try {
    const sales = await prisma.sale.findMany({
      include: {
        items: true
      },
      orderBy: {
        date: 'desc'
      }
    });
    
    res.json(sales);
  } catch (error) {
    console.error('Erro ao buscar vendas:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.get('/api/unit-equivalences', async (req, res) => {
  try {
    const equivalences = await prisma.unitEquivalence.findMany({
      orderBy: { unitName: 'asc' }
    });
    res.json(equivalences);
  } catch (error) {
    console.error('Erro ao buscar equivalências:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /api/unit-equivalences - Criar nova equivalência
app.post('/api/unit-equivalences', async (req, res) => {
  try {
    const { unitName, value } = req.body;
    
    if (!unitName || !value || value <= 0) {
      return res.status(400).json({ error: 'Nome da unidade e valor são obrigatórios' });
    }

    // Verificar se já existe equivalência para esta unidade
    const existingEquivalence = await prisma.unitEquivalence.findUnique({
      where: { unitName }
    });

    if (existingEquivalence) {
      return res.status(409).json({ error: 'Unidade já possui equivalência definida' });
    }

    const equivalence = await prisma.unitEquivalence.create({
      data: { 
        unitName, 
        value: parseFloat(value) 
      }
    });
    
    res.status(201).json(equivalence);
  } catch (error) {
    console.error('Erro ao criar equivalência:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// PUT /api/unit-equivalences/:unitName - Atualizar equivalência
app.put('/api/unit-equivalences/:unitName', async (req, res) => {
  try {
    const { unitName } = req.params;
    const { value } = req.body;
    
    if (!value || value <= 0) {
      return res.status(400).json({ error: 'Valor é obrigatório e deve ser maior que zero' });
    }

    const equivalence = await prisma.unitEquivalence.update({
      where: { unitName },
      data: { value: parseFloat(value) }
    });
    
    res.json(equivalence);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Equivalência não encontrada' });
    }
    console.error('Erro ao atualizar equivalência:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// DELETE /api/unit-equivalences/:unitName - Deletar equivalência
app.delete('/api/unit-equivalences/:unitName', async (req, res) => {
  try {
    const { unitName } = req.params;
    
    await prisma.unitEquivalence.delete({
      where: { unitName }
    });
    
    res.json({ message: 'Equivalência excluída com sucesso' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Equivalência não encontrada' });
    }
    console.error('Erro ao excluir equivalência:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});


// ROTA DE TESTE
// Middleware para servir os arquivos estáticos do React
app.use(express.static(path.join(__dirname, "dist")));

// Redireciona todas as requisições que não sejam da API para o React
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// MIDDLEWARE GLOBAL DE ERRO
app.use((err, req, res, next) => {
  console.error("Erro:", err);
  res.status(500).json({ error: "Erro interno do servidor", details: err.message });
});

app.listen(port, () => {
  console.log(`Server tá on krai --> http://localhost:${port}`);
});
