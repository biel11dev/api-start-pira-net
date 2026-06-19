-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "cartSnapshot" JSONB,
ADD COLUMN     "paymentId" TEXT,
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "paymentStatus" TEXT,
ADD COLUMN     "qaSaleId" TEXT;
