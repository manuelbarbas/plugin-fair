import { Transaction, EVMTransaction } from '../index';
import { getErrorMessage } from '../utils/error-handling';

import { BITE } from '@skalenetwork/bite';

export class BiteMiddleware {
  constructor() {}

  async encryptTransaction(rpc: string, transaction: EVMTransaction): Promise<Transaction> {
    try {
      const bite = new BITE(rpc);

      const tx: Transaction = {
        to: transaction.to,
        data: transaction.data,
      };

      const ecryptedTransaction = await bite.encryptTransaction(tx);

      return ecryptedTransaction;
    } catch (error) {
      const errorMsg = `Failed to encrypt transaction: ${getErrorMessage(error)}`;
      throw new Error(errorMsg);
    }
  }
}
