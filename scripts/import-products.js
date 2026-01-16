import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// URL da API externa
const API_URL = 'https://api-start-pira.vercel.app/api';

async function importProducts() {
  try {
    console.log('🚀 Iniciando importação de produtos...\n');

    // 1. Buscar produtos da API externa
    console.log('📥 Buscando produtos da API externa...');
    const response = await fetch(`${API_URL}/products`);
    
    if (!response.ok) {
      throw new Error(`Erro ao buscar produtos: ${response.statusText}`);
    }

    const externalProducts = await response.json();
    console.log(`✅ ${externalProducts.length} produtos encontrados\n`);

    // 2. Extrair todas as unidades de medida únicas
    const uniqueUnits = [...new Set(externalProducts.map(p => p.unit))];
    console.log('📦 Criando unidades de medida...'); 
    
    for (const unitName of uniqueUnits) {
      await prisma.unitMeasure.upsert({
        where: { name: unitName },
        update: {},
        create: {
          name: unitName,
          description: `Unidade: ${unitName}`
        }
      });
    }
    console.log(`✅ ${uniqueUnits.length} unidades de medida criadas\n`);

    // 3. Extrair e criar categorias (principais e subcategorias)
    console.log('📂 Criando categorias...');
    const categoriesMap = new Map();

    // Primeiro criar categorias principais (sem parentId)
    for (const product of externalProducts) {
      if (product.category) {
        const mainCategory = product.category.parent || product.category;
        
        if (mainCategory && !categoriesMap.has(mainCategory.id)) {
          const existingCategory = await prisma.category.findFirst({
            where: { name: mainCategory.name }
          });

          if (!existingCategory) {
            const created = await prisma.category.create({
              data: {
                name: mainCategory.name,
                parentId: null
              }
            });
            categoriesMap.set(mainCategory.id, created);
            console.log(`  ✓ Categoria principal: ${mainCategory.name}`);
          } else {
            categoriesMap.set(mainCategory.id, existingCategory);
          }
        }
      }
    }

    // Depois criar subcategorias
    for (const product of externalProducts) {
      if (product.category && product.category.parentId) {
        if (!categoriesMap.has(product.category.id)) {
          const parentCategoryLocal = categoriesMap.get(product.category.parentId);
          
          if (parentCategoryLocal) {
            const existingSubcategory = await prisma.category.findFirst({
              where: { 
                name: product.category.name,
                parentId: parentCategoryLocal.id
              }
            });

            if (!existingSubcategory) {
              const created = await prisma.category.create({
                data: {
                  name: product.category.name,
                  parentId: parentCategoryLocal.id
                }
              });
              categoriesMap.set(product.category.id, created);
              console.log(`  ✓ Subcategoria: ${product.category.name} (${parentCategoryLocal.name})`);
            } else {
              categoriesMap.set(product.category.id, existingSubcategory);
            }
          }
        }
      }
    }
    console.log(`✅ Categorias criadas\n`);

    // 4. Importar produtos
    console.log('📦 Importando produtos...');
    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const extProduct of externalProducts) {
      try {
        // Buscar categoria local correspondente
        const localCategory = categoriesMap.get(extProduct.categoryId);

        // Verificar se produto já existe pelo nome
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
          categoryId: localCategory?.id || null,
          image: null // Pode adicionar emoji baseado na categoria se desejar
        };

        if (existingProduct) {
          // Atualizar produto existente
          await prisma.product.update({
            where: { id: existingProduct.id },
            data: productData
          });
          updatedCount++;
          console.log(`  ↻ Atualizado: ${extProduct.name}`);
        } else {
          // Criar novo produto
          await prisma.product.create({
            data: productData
          });
          importedCount++;
          console.log(`  + Importado: ${extProduct.name}`);
        }
      } catch (error) {
        console.error(`  ✗ Erro ao importar ${extProduct.name}:`, error.message);
        skippedCount++;
      }
    }

    console.log('\n🎉 Importação concluída!');
    console.log(`📊 Resumo:`);
    console.log(`   • Produtos importados: ${importedCount}`);
    console.log(`   • Produtos atualizados: ${updatedCount}`);
    console.log(`   • Produtos ignorados: ${skippedCount}`);
    console.log(`   • Total processado: ${externalProducts.length}`);

  } catch (error) {
    console.error('❌ Erro na importação:', error);
    throw error;
  }
}

async function main() {
  console.log('🔄 Iniciando sincronização com API externa...\n');
  
  await importProducts();
  
  console.log('\n✅ Sincronização concluída com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro fatal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
