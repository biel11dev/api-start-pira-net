import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

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

// ============================================
// ROTA DE IMPORTAÇÃO
// ============================================

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
    res.status(500).json({ 
      success: false,
      error: 'Erro ao importar produtos', 
      details: error.message 
    });
  }
});

// ============================================
// ESTATÍSTICAS POR UNIDADE
// ============================================

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

export { app, prisma, PORT };
