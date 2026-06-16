import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

// URL do sistema interno (fonte da verdade: produtos por componentes, estoque e vendas)
const QA_API_URL = process.env.QA_API_URL || 'https://api-start-pira-qa.vercel.app';

// Middlewares
app.use(cors());
// Aumentar limite de payload para suportar imagens base64 (50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Middleware de autenticação
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido' });
    }
    req.user = user;
    next();
  });
};

// ============================================
// ROTAS DE AUTENTICAÇÃO
// ============================================

// POST - Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validar credenciais (usuário hardcoded por enquanto)
    // Em produção, buscar do banco de dados
    const validUsers = [
      {
        id: 1,
        email: 'admin@startpira.com',
        password: await bcrypt.hash('admin123', 10), // Em produção, já deve estar hasheado no banco
        name: 'Administrador'
      }
    ];

    const user = validUsers.find(u => u.email === email);

    if (!user) {
      return res.status(401).json({ error: 'Email ou senha inválidos', message: 'Usuário não encontrado' });
    }

    // Verificar senha
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Email ou senha inválidos', message: 'Senha incorreta' });
    }

    // Gerar token JWT
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro ao fazer login', details: error.message });
  }
});

// GET - Verificar token
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});


// ============================================
// ROTAS DE UNIDADES DE MEDIDA
// ============================================

// GET - Listar todas as unidades de medida
app.get('/api/unit-measures', async (req, res) => {
  try {
    const units = await prisma.unitMeasure.findMany({
      orderBy: { name: 'asc' }
    });
    res.json(units);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar unidades', details: error.message });
  }
});

// POST - Criar unidade de medida
app.post('/api/unit-measures', async (req, res) => {
  try {
    const { name, abbreviation, description } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Nome da unidade é obrigatório' });
    }

    const unit = await prisma.unitMeasure.create({
      data: {
        name: name.trim(),
        abbreviation: abbreviation?.trim() || null,
        description: description?.trim() || null
      }
    });
    
    res.status(201).json(unit);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Unidade com este nome já existe' });
    }
    res.status(500).json({ error: 'Erro ao criar unidade', details: error.message });
  }
});

// PUT - Atualizar unidade de medida
app.put('/api/unit-measures/:id', async (req, res) => {
  try {
    const { name, abbreviation, description } = req.body;
    const unitId = parseInt(req.params.id);

    if (isNaN(unitId)) {
      return res.status(400).json({ error: 'ID da unidade inválido' });
    }

    const unit = await prisma.unitMeasure.update({
      where: { id: unitId },
      data: {
        name: name?.trim(),
        abbreviation: abbreviation?.trim() || null,
        description: description?.trim() || null
      }
    });

    res.json(unit);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Unidade não encontrada' });
    }
    res.status(500).json({ error: 'Erro ao atualizar unidade', details: error.message });
  }
});

// DELETE - Excluir unidade de medida
app.delete('/api/unit-measures/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    await prisma.unitMeasure.delete({ where: { id } });
    res.json({ message: 'Unidade excluída com sucesso' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Unidade não encontrada' });
    }
    res.status(500).json({ error: 'Erro ao excluir unidade', details: error.message });
  }
});

// GET - Estatísticas de produtos por unidade de medida
app.get('/api/stats/by-unit', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      select: {
        unit: true,
        quantity: true,
        price: true,
        costPrice: true
      }
    });

    // Agrupar por unidade
    const statsByUnit = products.reduce((acc, product) => {
      const unit = product.unit || 'Sem unidade';
      
      if (!acc[unit]) {
        acc[unit] = {
          unit: unit,
          count: 0,
          totalQuantity: 0,
          avgPrice: 0,
          avgCostPrice: 0,
          totalValue: 0
        };
      }

      acc[unit].count++;
      acc[unit].totalQuantity += product.quantity || 0;
      acc[unit].totalValue += (product.price || 0) * (product.quantity || 0);
      acc[unit].avgPrice += product.price || 0;
      acc[unit].avgCostPrice += product.costPrice || 0;

      return acc;
    }, {});

    // Calcular médias
    Object.values(statsByUnit).forEach(stat => {
      stat.avgPrice = stat.avgPrice / stat.count;
      stat.avgCostPrice = stat.avgCostPrice / stat.count;
    });

    res.json(Object.values(statsByUnit));
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar estatísticas', details: error.message });
  }
});

// POST - Importar produtos da API externa
app.post('/api/import/products', async (req, res) => {
  try {
    const API_URL = 'https://api-start-pira.vercel.app/api';
    
    
    // Buscar produtos da API externa
    const response = await fetch(`${API_URL}/products`);
    
    if (!response.ok) {
      throw new Error(`Erro ao buscar produtos: ${response.statusText}`);
    }

    const externalProducts = await response.json();
    
    let importedCount = 0;
    let updatedCount = 0;
    let errors = [];

    // Importar cada produto
    for (const extProduct of externalProducts) {
      try {
        // Criar/atualizar unidade de medida
        await prisma.unitMeasure.upsert({
          where: { name: extProduct.unit },
          update: {},
          create: {
            name: extProduct.unit,
            description: `Unidade: ${extProduct.unit}`
          }
        });

        // Buscar ou criar categoria
        let categoryId = null;
        if (extProduct.category) {
          const categoryName = extProduct.category.name;
          const parentCategoryName = extProduct.category.parent?.name;

          // Se tem categoria pai
          if (parentCategoryName) {
            const parentCategory = await prisma.category.upsert({
              where: { name: parentCategoryName },
              update: {},
              create: { name: parentCategoryName }
            });

            const subcategory = await prisma.category.upsert({
              where: { name: categoryName },
              update: {},
              create: { 
                name: categoryName,
                parentId: parentCategory.id
              }
            });
            categoryId = subcategory.id;
          } else {
            const category = await prisma.category.upsert({
              where: { name: categoryName },
              update: {},
              create: { name: categoryName }
            });
            categoryId = category.id;
          }
        }

        // Verificar se produto já existe
        const existingProduct = await prisma.product.findFirst({
          where: { name: extProduct.name }
        });

        const productData = {
          name: extProduct.name,
          description: `Unidade: ${extProduct.unit}`,
          price: extProduct.value || 0,
          costPrice: extProduct.valuecusto || 0,
          quantity: extProduct.quantity || 0,
          unit: extProduct.unit,
          available: true,
          categoryId: categoryId
        };

        if (existingProduct) {
          await prisma.product.update({
            where: { id: existingProduct.id },
            data: productData
          });
          updatedCount++;
        } else {
          await prisma.product.create({
            data: productData
          });
          importedCount++;
        }
      } catch (error) {
        errors.push({
          product: extProduct.name,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: 'Importação concluída',
      imported: importedCount,
      updated: updatedCount,
      total: externalProducts.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('❌ Erro na importação:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro ao importar produtos', 
      details: error.message 
    });
  }
});

// ============================================
// ROTAS DE CATEGORIAS
// ============================================

// GET - Buscar todas as categorias (apenas principais com subcategorias)
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: { parentId: null }, // Apenas categorias principais
      include: {
        subcategories: {
          include: {
            products: true
          }
        },
        products: true
      },
      orderBy: { name: 'asc' }
    });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar categorias', details: error.message });
  }
});

// GET - Buscar todas as categorias (incluindo subcategorias)
app.get('/api/categories/all', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        parent: true,
        subcategories: true,
        products: true
      },
      orderBy: { name: 'asc' }
    });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar categorias', details: error.message });
  }
});

// GET - Buscar categoria específica
app.get('/api/categories/:id', async (req, res) => {
  try {
    const category = await prisma.category.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        parent: true,
        subcategories: true,
        products: {
          where: { available: true }
        }
      }
    });
    
    if (!category) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }
    
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar categoria', details: error.message });
  }
});

// POST - Criar categoria ou subcategoria
app.post('/api/categories', async (req, res) => {
  try {
    const { name, parentId } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Nome da categoria é obrigatório' });
    }

    const data = { name: name.trim() };
    if (parentId && !isNaN(parseInt(parentId))) {
      // Verificar se a categoria pai existe
      const parentCategory = await prisma.category.findUnique({
        where: { id: parseInt(parentId) }
      });
      
      if (!parentCategory) {
        return res.status(404).json({ error: 'Categoria pai não encontrada' });
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
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Categoria com este nome já existe' });
    }
    res.status(500).json({ error: 'Erro ao criar categoria', details: error.message });
  }
});

// PUT - Atualizar categoria
app.put('/api/categories/:id', async (req, res) => {
  try {
    const { name, parentId } = req.body;
    const categoryId = parseInt(req.params.id);
    
    if (isNaN(categoryId)) {
      return res.status(400).json({ error: 'ID da categoria inválido' });
    }

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Nome da categoria é obrigatório' });
    }

    const data = { name: name.trim() };
    
    if (parentId !== undefined) {
      if (parentId === null || parentId === '') {
        data.parentId = null;
      } else {
        const parentIdNum = parseInt(parentId);
        if (parentIdNum === categoryId) {
          return res.status(400).json({ error: 'Uma categoria não pode ser pai de si mesma' });
        }
        
        const parentCategory = await prisma.category.findUnique({
          where: { id: parentIdNum }
        });
        
        if (!parentCategory) {
          return res.status(404).json({ error: 'Categoria pai não encontrada' });
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
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Categoria com este nome já existe' });
    }
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }
    res.status(500).json({ error: 'Erro ao atualizar categoria', details: error.message });
  }
});

// DELETE - Excluir categoria
app.delete('/api/categories/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    // Verificar se tem subcategorias
    const subcategories = await prisma.category.findMany({
      where: { parentId: id }
    });

    if (subcategories.length > 0) {
      return res.status(400).json({ 
        error: 'Não é possível excluir uma categoria que possui subcategorias' 
      });
    }

    // Verificar se tem produtos
    const productsCount = await prisma.product.count({
      where: { categoryId: id }
    });

    if (productsCount > 0) {
      return res.status(400).json({ 
        error: 'Não é possível excluir uma categoria que possui produtos associados' 
      });
    }

    await prisma.category.delete({ where: { id } });
    res.json({ message: 'Categoria excluída com sucesso' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }
    res.status(500).json({ error: 'Erro ao excluir categoria', details: error.message });
  }
});

// ============================================
// ROTAS DE PRODUTOS
// ============================================

// GET - Buscar todos os produtos
app.get('/api/products', async (req, res) => {
  try {
    const { available, categoryId } = req.query;
    
    const where = {};
    if (available !== undefined) {
      where.available = available === 'true';
    }
    if (categoryId) {
      where.categoryId = parseInt(categoryId);
    }

    const products = await prisma.product.findMany({
      where,
      include: { 
        category: {
          include: {
            parent: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });
    
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar produtos', details: error.message });
  }
});

// GET - Buscar cardápio completo (categorias com produtos disponíveis)
app.get('/api/cardapio', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: { parentId: null },
      include: {
        subcategories: {
          include: {
            products: {
              where: { available: true },
              orderBy: { name: 'asc' }
            }
          }
        },
        products: {
          where: { available: true },
          orderBy: { name: 'asc' }
        }
      },
      orderBy: { name: 'asc' }
    });
    
    // Transformar para formato compatível com frontend antigo
    const cardapio = categories.map(cat => ({
      id: cat.id,
      categoria: cat.name,
      produtos: cat.products.map(prod => ({
        id: prod.id,
        nome: prod.name,
        descricao: prod.description,
        preco: prod.price,
        imagem: prod.image,
        disponivel: prod.available
      }))
    }));
    
    res.json(cardapio);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar cardápio', details: error.message });
  }
});

// ============================================
// INTEGRAÇÃO COM SISTEMA INTERNO (QA) - PRODUTOS POR COMPONENTES / ESTOQUE / VENDAS
// ============================================

// Converte um item de estoque do QA para o formato de produto do cardápio público
const mapearProdutoQA = (item, imageMap = {}) => ({
  id: item.id, // estoqueId
  name: item.name,
  description: imageMap[item.name?.toLowerCase()?.trim()]?.description || '',
  price: item.value,
  image: imageMap[item.name?.toLowerCase()?.trim()]?.image || '',
  available: item.quantity > 0,
  unit: item.unit,
  quantity: item.quantity,
  productId: item.productId,
  composicoes: (item.composicoes || []).map(c => ({
    id: c.id,
    nome: c.nome,
    descricao: c.descricao,
    obrigatorio: c.obrigatorio,
    multiplo: c.multiplo,
    minOpcoes: c.minOpcoes,
    maxOpcoes: c.maxOpcoes,
    ordem: c.ordem,
    opcoes: (c.opcoes || [])
      .filter(o => o.disponivel)
      .map(o => ({
        id: o.id,
        nome: o.nome,
        valorExtra: o.valorExtra,
        disponivel: o.disponivel,
        estoqueId: o.estoqueId
      }))
  }))
});

// Agrupa os itens vendáveis do QA na hierarquia categoria > subcategoria
const agruparCardapioQA = (estoqueItems, imageMap = {}) => {
  // Excluir itens que são apenas componentes de composição (vinculados via composicaoOpcoes)
  const vendiveis = estoqueItems.filter(p => !(p._count?.composicaoOpcoes > 0));
  const parentsMap = new Map();

  const getParent = (id, name) => {
    const key = id != null ? `c${id}` : 'outros';
    if (!parentsMap.has(key)) {
      parentsMap.set(key, { id: id != null ? id : 'outros', name, products: [], subMap: new Map() });
    }
    return parentsMap.get(key);
  };

  for (const item of vendiveis) {
    const produto = mapearProdutoQA(item, imageMap);
    const cat = item.category;
    if (cat && cat.parent) {
      const parent = getParent(cat.parent.id, cat.parent.name);
      const subKey = `s${cat.id}`;
      if (!parent.subMap.has(subKey)) {
        parent.subMap.set(subKey, { id: cat.id, name: cat.name, products: [] });
      }
      parent.subMap.get(subKey).products.push(produto);
    } else if (cat) {
      getParent(cat.id, cat.name).products.push(produto);
    } else {
      getParent(null, 'Outros').products.push(produto);
    }
  }

  return Array.from(parentsMap.values()).map(p => ({
    id: p.id,
    name: p.name,
    products: p.products,
    subcategories: Array.from(p.subMap.values())
  }));
};

// Monta um mapa nome(produto) -> { image, description } a partir do catálogo local do net
const carregarImagensLocais = async () => {
  const imageMap = {};
  try {
    const produtosNet = await prisma.product.findMany({
      select: { name: true, image: true, description: true }
    });
    for (const p of produtosNet) {
      if (!p.name) continue;
      imageMap[p.name.toLowerCase().trim()] = {
        image: p.image || '',
        description: p.description || ''
      };
    }
  } catch (error) {
    console.error('Não foi possível carregar imagens locais:', error.message);
  }
  return imageMap;
};

// GET - Cardápio público consumindo o sistema interno (produtos por componentes)
app.get('/api/cardapio-qa', async (req, res) => {
  try {
    const [response, imageMap] = await Promise.all([
      fetch(`${QA_API_URL}/api/estoque_prod`),
      carregarImagensLocais()
    ]);
    if (!response.ok) {
      return res.status(502).json({ error: 'Não foi possível obter o cardápio do sistema interno' });
    }
    const estoque = await response.json();
    res.json(agruparCardapioQA(estoque, imageMap));
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar cardápio do sistema interno', details: error.message });
  }
});

// POST - Registrar pedido público como venda no sistema interno (baixa estoque)
app.post('/api/pedido-qa', async (req, res) => {
  try {
    const { cliente, itens, observacoes } = req.body;

    if (!cliente || !cliente.nome || !Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    const items = itens.map(i => ({
      id: i.id, // estoqueId
      name: i.name,
      price: Number(i.price),
      quantity: Number(i.quantity),
      unit: i.unit,
      ...(i.composicao ? { composicao: i.composicao } : {}),
      ...(i.composicaoLabel ? { composicaoLabel: i.composicaoLabel } : {})
    }));

    const total = items.reduce((soma, i) => soma + i.price * i.quantity, 0);

    const saleData = {
      items,
      total,
      paymentMethod: 'Pedido Online',
      customerName: cliente.nome,
      amountReceived: total,
      change: 0,
      date: new Date().toISOString(),
      discount: null,
      splitPayments: null,
      pendente: null,
      vale: null,
      subtotal: total,
      finalTotal: total
    };

    const qaRes = await fetch(`${QA_API_URL}/api/sales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(saleData)
    });
    const data = await qaRes.json();

    if (!qaRes.ok) {
      return res.status(qaRes.status).json({
        error: data.error || 'Erro ao registrar pedido no sistema interno'
      });
    }

    // Montar mensagem para WhatsApp
    let mensagem = `*NOVO PEDIDO #${data.id}*\n\n`;
    mensagem += `*Cliente:* ${cliente.nome}\n`;
    if (cliente.telefone) mensagem += `*Telefone:* ${cliente.telefone}\n`;
    if (cliente.endereco) mensagem += `*Endereco:* ${cliente.endereco}\n`;
    mensagem += `\n*ITENS DO PEDIDO:*\n`;

    items.forEach((item, index) => {
      mensagem += `\n${index + 1}. *${item.name}*\n`;
      if (item.composicaoLabel) mensagem += `   ${item.composicaoLabel}\n`;
      mensagem += `   Qtd: ${item.quantity}x | R$ ${item.price.toFixed(2)}\n`;
      mensagem += `   Subtotal: R$ ${(item.price * item.quantity).toFixed(2)}\n`;
    });

    mensagem += `\n*VALOR TOTAL: R$ ${total.toFixed(2)}*`;
    if (observacoes) mensagem += `\n\n*Observacoes:* ${observacoes}`;

    const telefoneEmpresa = process.env.WHATSAPP_NUMBER || '5511999999999';
    const whatsappLink = `https://wa.me/${telefoneEmpresa}?text=${encodeURIComponent(mensagem)}`;

    res.json({
      success: true,
      orderId: data.id,
      saleId: data.id,
      total,
      whatsappLink,
      mensagem
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao registrar pedido no sistema interno', details: error.message });
  }
});

// GET - Buscar produto específico
app.get('/api/products/:id', async (req, res) => {
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
    
    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar produto', details: error.message });
  }
});

// POST - Criar produto
app.post('/api/products', async (req, res) => {
  try {
    const { name, description, price, image, available, categoryId, quantity, unit, costPrice } = req.body;

    if (!name || !price) {
      return res.status(400).json({ error: 'Nome e preço são obrigatórios' });
    }

    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ error: 'Preço deve ser um número válido' });
    }

    const data = { 
      name: name.trim(), 
      price: parsedPrice,
      description: description?.trim() || null,
      image: image?.trim() || null,
      available: available !== undefined ? available : true,
      categoryId: categoryId ? parseInt(categoryId) : null,
      quantity: quantity ? parseInt(quantity) : null,
      unit: unit?.trim() || null,
      costPrice: costPrice ? parseFloat(costPrice) : null
    };

    const newProduct = await prisma.product.create({
      data,
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
    res.status(500).json({ error: 'Erro ao criar produto', details: error.message });
  }
});

// PUT - Atualizar produto
app.put('/api/products/:id', async (req, res) => {
  try {
    const { name, description, price, image, available, categoryId, quantity, unit, costPrice } = req.body;
    const productId = parseInt(req.params.id);

    if (isNaN(productId)) {
      return res.status(400).json({ error: 'ID do produto inválido' });
    }

    if (!name || !price) {
      return res.status(400).json({ error: 'Nome e preço são obrigatórios' });
    }

    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ error: 'Preço deve ser um número válido' });
    }

    const data = { 
      name: name.trim(), 
      price: parsedPrice,
      description: description?.trim() || null,
      image: image?.trim() || null,
      available: available !== undefined ? available : true,
      categoryId: categoryId ? parseInt(categoryId) : null,
      quantity: quantity !== undefined ? (quantity ? parseInt(quantity) : null) : undefined,
      unit: unit !== undefined ? (unit?.trim() || null) : undefined,
      costPrice: costPrice !== undefined ? (costPrice ? parseFloat(costPrice) : null) : undefined
    };

    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data,
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
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    res.status(500).json({ error: 'Erro ao atualizar produto', details: error.message });
  }
});

// PUT - Atualizar disponibilidade do produto
app.put('/api/products/:id/disponibilidade', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const { available } = req.body;

    if (isNaN(productId)) {
      return res.status(400).json({ error: 'ID do produto inválido' });
    }

    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: { available: available !== undefined ? available : true },
      include: { category: true }
    });

    res.json(updatedProduct);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    res.status(500).json({ error: 'Erro ao atualizar disponibilidade', details: error.message });
  }
});

// DELETE - Excluir produto
app.delete('/api/products/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    await prisma.product.delete({ where: { id } });
    res.json({ message: 'Produto excluído com sucesso' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    res.status(500).json({ error: 'Erro ao excluir produto', details: error.message });
  }
});

// ============================================
// ROTAS DE PEDIDOS
// ============================================

// GET - Buscar todos os pedidos
app.get('/api/orders', async (req, res) => {
  try {
    const { status } = req.query;
    
    const where = {};
    if (status) {
      where.status = status;
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        items: {
          include: {
            product: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar pedidos', details: error.message });
  }
});

// GET - Buscar pedido específico
app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        items: {
          include: {
            product: true
          }
        }
      }
    });
    
    if (!order) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }
    
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar pedido', details: error.message });
  }
});

// POST - Criar pedido e gerar link do WhatsApp
app.post('/api/pedido', async (req, res) => {
  try {
    const { cliente, itens, observacoes } = req.body;
    
    if (!cliente || !cliente.nome || !itens || itens.length === 0) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }
    
    // Buscar produtos para calcular total
    const productIds = itens.map(item => item.produtoId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } }
    });
    
    let total = 0;
    const orderItems = [];
    const detalhesItens = [];
    
    for (const item of itens) {
      const product = products.find(p => p.id === item.produtoId);
      if (!product) {
        return res.status(404).json({ error: `Produto ${item.produtoId} não encontrado` });
      }
      
      const subtotal = product.price * item.quantidade;
      total += subtotal;
      
      orderItems.push({
        productId: product.id,
        productName: product.name,
        quantity: item.quantidade,
        unitPrice: product.price,
        subtotal: subtotal
      });
      
      detalhesItens.push({
        nome: product.name,
        quantidade: item.quantidade,
        preco: product.price,
        subtotal: subtotal
      });
    }
    
    // Criar pedido no banco
    const order = await prisma.order.create({
      data: {
        customerName: cliente.nome,
        customerPhone: cliente.telefone || null,
        customerAddress: cliente.endereco || null,
        observations: observacoes || null,
        total: total,
        status: 'pending',
        items: {
          create: orderItems
        }
      },
      include: {
        items: true
      }
    });
    
    // Montar mensagem para WhatsApp
    let mensagem = `*NOVO PEDIDO #${order.id}*\n\n`;
    mensagem += `*Cliente:* ${cliente.nome}\n`;
    if (cliente.telefone) mensagem += `*Telefone:* ${cliente.telefone}\n`;
    if (cliente.endereco) mensagem += `*Endereco:* ${cliente.endereco}\n`;
    mensagem += `\n*ITENS DO PEDIDO:*\n`;
    
    detalhesItens.forEach((item, index) => {
      mensagem += `\n${index + 1}. *${item.nome}*\n`;
      mensagem += `   Qtd: ${item.quantidade}x | R$ ${item.preco.toFixed(2)}\n`;
      mensagem += `   Subtotal: R$ ${item.subtotal.toFixed(2)}\n`;
    });
    
    mensagem += `\n*VALOR TOTAL: R$ ${total.toFixed(2)}*`;
    
    if (observacoes) {
      mensagem += `\n\n*Observacoes:* ${observacoes}`;
    }
    
    // Gerar link do WhatsApp
    const telefoneEmpresa = process.env.WHATSAPP_NUMBER || '5511999999999';
    const mensagemEncoded = encodeURIComponent(mensagem);
    const whatsappLink = `https://wa.me/${telefoneEmpresa}?text=${mensagemEncoded}`;
    
    res.json({
      success: true,
      orderId: order.id,
      pedido: {
        cliente,
        itens: detalhesItens,
        total,
        observacoes
      },
      whatsappLink,
      mensagem
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar pedido', details: error.message });
  }
});

// PUT - Atualizar status do pedido
app.put('/api/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const orderId = parseInt(req.params.id);

    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'ID do pedido inválido' });
    }

    const validStatuses = ['pending', 'confirmed', 'preparing', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { status },
      include: {
        items: true
      }
    });

    res.json(updatedOrder);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }
    res.status(500).json({ error: 'Erro ao atualizar pedido', details: error.message });
  }
});

// ============================================
// ROTAS DE SUGESTÕES/DESTAQUES
// ============================================

// GET - Buscar sugestões
app.get('/api/sugestoes', async (req, res) => {
  try {
    const suggestions = await prisma.suggestion.findMany({
      where: { active: true },
      orderBy: { order: 'asc' }
    });
    
    const productIds = suggestions.map(s => s.productId);
    const products = await prisma.product.findMany({
      where: { 
        id: { in: productIds },
        available: true
      },
      include: {
        category: true
      }
    });
    
    const produtosSugeridos = suggestions.map(sug => {
      const product = products.find(p => p.id === sug.productId);
      if (!product) return null;
      
      return {
        id: product.id,
        nome: product.name,
        descricao: product.description,
        preco: product.price,
        imagem: product.image,
        disponivel: product.available,
        categoria: product.category?.name,
        motivo: sug.reason
      };
    }).filter(p => p !== null);
    
    res.json(produtosSugeridos);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar sugestões', details: error.message });
  }
});

// POST - Criar sugestão
app.post('/api/sugestoes', async (req, res) => {
  try {
    const { productId, reason, order } = req.body;
    
    if (!productId || !reason) {
      return res.status(400).json({ error: 'ProductId e reason são obrigatórios' });
    }

    const suggestion = await prisma.suggestion.create({
      data: {
        productId: parseInt(productId),
        reason: reason.trim(),
        order: order ? parseInt(order) : 0,
        active: true
      }
    });
    
    res.status(201).json(suggestion);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar sugestão', details: error.message });
  }
});

// DELETE - Remover sugestão
app.delete('/api/sugestoes/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    await prisma.suggestion.delete({ where: { id } });
    res.json({ message: 'Sugestão removida com sucesso' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Sugestão não encontrada' });
    }
    res.status(500).json({ error: 'Erro ao remover sugestão', details: error.message });
  }
});

// ============================================
// ROTAS AUXILIARES
// ============================================
// ============================================
// ROTAS AUXILIARES
// ============================================

// Rota de health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'API de Pedidos Online funcionando!',
    database: 'Connected with Prisma'
  });
});

// ============================================
// ROTAS DE SUGESTÕES DE MELHORIAS
// ============================================

// GET - Listar todas as sugestões
app.get('/api/sugestoes-melhorias', async (req, res) => {
  try {
    const sugestoes = await prisma.sugestaoMelhoria.findMany({
      orderBy: { votos: 'desc' }
    });
    res.json(sugestoes);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar sugestões', details: error.message });
  }
});

// POST - Criar nova sugestão
app.post('/api/sugestoes-melhorias', async (req, res) => {
  try {
    const { titulo, descricao, categoria } = req.body;
    
    if (!titulo || titulo.trim() === '') {
      return res.status(400).json({ error: 'Título da sugestão é obrigatório' });
    }

    const sugestao = await prisma.sugestaoMelhoria.create({
      data: {
        titulo: titulo.trim(),
        descricao: descricao?.trim() || '',
        categoria: categoria?.trim() || 'Sugestão',
        votos: 0
      }
    });
    
    res.status(201).json(sugestao);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar sugestão', details: error.message });
  }
});

// PUT - Atualizar votos da sugestão
app.put('/api/sugestoes-melhorias/:id/votar', async (req, res) => {
  try {
    const sugestaoId = parseInt(req.params.id);
    const { incremento } = req.body; // +1 para votar, -1 para remover voto

    if (isNaN(sugestaoId)) {
      return res.status(400).json({ error: 'ID da sugestão inválido' });
    }

    const sugestaoAtual = await prisma.sugestaoMelhoria.findUnique({
      where: { id: sugestaoId }
    });

    if (!sugestaoAtual) {
      return res.status(404).json({ error: 'Sugestão não encontrada' });
    }

    const novosVotos = Math.max(0, sugestaoAtual.votos + (incremento || 0));

    const sugestao = await prisma.sugestaoMelhoria.update({
      where: { id: sugestaoId },
      data: { votos: novosVotos }
    });

    res.json(sugestao);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao votar na sugestão', details: error.message });
  }
});

// DELETE - Excluir sugestão
app.delete('/api/sugestoes-melhorias/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    await prisma.sugestaoMelhoria.delete({ where: { id } });
    res.json({ message: 'Sugestão excluída com sucesso' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Sugestão não encontrada' });
    }
    res.status(500).json({ error: 'Erro ao excluir sugestão', details: error.message });
  }
});

// ============================================
// ROTAS DE CONFIGURAÇÕES
// ============================================

// GET - Buscar todas as configurações
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await prisma.settings.findMany();
    
    // Converter para formato objeto { key: value }
    const settingsObj = settings.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {});
    
    res.json(settingsObj);
  } catch (error) {
    console.error('❌ Erro ao buscar configurações:', error);
    res.status(500).json({ 
      error: 'Erro ao buscar configurações', 
      details: error.message,
      hint: 'Certifique-se de que executou: npx prisma generate && npx prisma migrate dev'
    });
  }
});

// GET - Buscar configuração específica por chave
app.get('/api/settings/:key', async (req, res) => {
  try {
    const setting = await prisma.settings.findUnique({
      where: { key: req.params.key }
    });
    
    if (!setting) {
      return res.status(404).json({ error: 'Configuração não encontrada' });
    }
    
    res.json({ key: setting.key, value: setting.value });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar configuração', details: error.message });
  }
});

// POST/PUT - Salvar ou atualizar múltiplas configurações
app.post('/api/settings', async (req, res) => {
  try {
    const settingsData = req.body;
    
    if (!settingsData || typeof settingsData !== 'object') {
      console.error('❌ Dados inválidos:', settingsData);
      return res.status(400).json({ error: 'Dados inválidos' });
    }


    const updates = [];
    
    for (const [key, value] of Object.entries(settingsData)) {
      updates.push(
        prisma.settings.upsert({
          where: { key },
          update: { value: value || '' },
          create: { key, value: value || '' }
        })
      );
    }
    
    await Promise.all(updates);
    
    const allSettings = await prisma.settings.findMany();
    const settingsObj = allSettings.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {});
    
    res.json(settingsObj);
  } catch (error) {
    res.status(500).json({ 
      error: 'Erro ao salvar configurações', 
      details: error.message,
      code: error.code 
    });
  }
});

// PUT - Atualizar configuração específica
app.put('/api/settings/:key', async (req, res) => {
  try {
    const { value, description } = req.body;
    const key = req.params.key;

    const setting = await prisma.settings.upsert({
      where: { key },
      update: { 
        value: value || '',
        description: description || null
      },
      create: { 
        key, 
        value: value || '',
        description: description || null
      }
    });

    res.json(setting);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar configuração', details: error.message });
  }
});

// DELETE - Excluir configuração
app.delete('/api/settings/:key', async (req, res) => {
  try {
    await prisma.settings.delete({
      where: { key: req.params.key }
    });
    
    res.json({ message: 'Configuração excluída com sucesso' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Configuração não encontrada' });
    }
    res.status(500).json({ error: 'Erro ao excluir configuração', details: error.message });
  }
});

// Middleware global de erro
app.use((err, req, res, next) => {
  console.error('Erro:', err);
  res.status(500).json({ error: 'Erro interno do servidor', details: err.message });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📱 API de Pedidos Online pronta!`);
  console.log(`🗄️  Prisma conectado ao banco de dados`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
