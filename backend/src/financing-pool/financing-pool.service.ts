import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SorobanService } from '../soroban/soroban.service';
import { FundResponseDto } from './dto';

@Injectable()
export class FinancingPoolService {
  private readonly logger = new Logger(FinancingPoolService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sorobanService: SorobanService,
  ) {}

  async fundInvoice(
    userId: string,
    invoiceId: string,
  ): Promise<FundResponseDto> {
    // 1. Find the invoice
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice ${invoiceId} not found`);
    }

    // 2. Check if already funded
    if (invoice.funded) {
      throw new ConflictException('Invoice already funded');
    }

    // 3. Check if user is authorized (must be the buyer)
    if (invoice.buyerId !== userId) {
      throw new ForbiddenException('Only the buyer can fund this invoice');
    }

    // 4. Check if invoice is in correct state
    if (invoice.status !== 'verified') {
      throw new BadRequestException('Invoice must be verified before funding');
    }

    try {
      // 5. Execute Soroban contract call
      const txResult = await this.sorobanService.fundInvoice(
        invoiceId,
        invoice.amount,
        invoice.asset,
      );

      // 6. Update invoice in database
      const updatedInvoice = await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          funded: true,
          fundedAt: new Date(),
          fundedTxHash: txResult.hash,
          status: 'funded',
        },
      });

      this.logger.log(
        `Invoice ${invoiceId} funded by user ${userId} with tx ${txResult.hash}`
      );

      return {
        success: true,
        invoiceId: updatedInvoice.id,
        txHash: txResult.hash,
        message: 'Invoice funded successfully',
        fundedAt: updatedInvoice.fundedAt!,
      };
    } catch (error) {
      this.logger.error(
        `Failed to fund invoice ${invoiceId}: ${error.message}`
      );
      
      // If the error is a contract revert, handle it gracefully
      if (error.message.includes('revert')) {
        throw new BadRequestException(
          `Contract reverted: ${error.message}`
        );
      }
      
      throw error;
    }
  }
}
