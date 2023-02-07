const https = require('https');
const AWS = require('aws-sdk');
AWS.config.update({ region: 'eu-west-2' });

const ddb = new AWS.DynamoDB();

exports.handler = async (event, context) => {
  try {
    console.log('Received event:', JSON.stringify(event, null, 2));
    console.log('Received context:', JSON.stringify(context, null, 2));
    console.log('Received event.body:', event.body);

    let event_data = JSON.parse(event.body);

    // Send notification when transaction is created. Multiple notifications will be sent on confirmation because of the reorgs.
    if (!event_data.confirmed) {
      console.log('Transaction is pending');

      let transaction = detectTransactionType(event_data);

      console.log('Transaction:', JSON.stringify(transaction, null, 2));

      const fromStatement = `SELECT * FROM "users" where wallets['${transaction.fromAddress}'] IS NOT MISSING;`;
      const toStatement = `SELECT * FROM "users" where wallets['${transaction.toAddress}'] IS NOT MISSING;`;

      const from = await ddb.executeStatement({ Statement: fromStatement }).promise();
      const to = await ddb.executeStatement({ Statement: toStatement }).promise();

      if (from.Items.length === 0 && to.Items.length === 0) {
        console.log('No users found');
        return true;
      }

      if (from.Items.length > 0) {
        await Promise.all(from.Items.map(async (item) => {
          const transactionMessageForSender = getTransactionMessageForSender(transaction, item.uniqueId.S);
          const senderNotification = await sendNotification(transactionMessageForSender);
          return {
            item,
            senderNotification
          }
        }));
      }

      if (to.Items.length > 0) {
        await Promise.all(to.Items.map(async (item) => {
          const transactionMessageForReceiver = getTransactionMessageForReceiver(transaction, item.uniqueId.S);
          const receiverNotification = await sendNotification(transactionMessageForReceiver);
          return {
            item,
            receiverNotification
          }
        }));
      }

      return true;
    } else {
      console.log('Transaction is confirmed');
      return true;
    }
  } catch (error) {
    console.log('Handler error');
    console.log(error);
    return false;
  }
};

function sendNotification(transaction) {
  return new Promise((resolve, reject) => {
    let options = {
      'app_id': process.env.ONESIGNAL_APP_ID,
      'data': {},
      'contents': {
        'en': transaction.message
      },
      'headings': {
        'en': transaction.title
      },
      'include_external_user_ids': [
        transaction.uniqueId
      ]
    };
    let headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Basic MzhmYzJhZWUtMzFhOC00NjE4LTk5ZTMtM2NhYTYzMjQ1MmRh',
    }

    let req = https.request({
      method: 'POST',
      host: 'onesignal.com',
      path: '/api/v1/notifications',
      headers: headers
    }, function (res) {
      res.on('data', function (data) {
        resolve(JSON.parse(data));
      });

      res.on('error', function (e) {
        console.log('Send notification error');
        console.log(e);
        reject(e);
      });
    });

    req.write(JSON.stringify(options));
    req.end();
  });
}

function detectTransactionType(transaction) {
  try {
    // if transaction has nft transfers
    if (transaction.nftTransfers.length > 0) {
      transaction.transactionType = 'nftTransfer';
      transaction.fromAddress = transaction.nftTransfers[0].from;
      transaction.toAddress = transaction.nftTransfers[0].to;
      if (transaction.nftTransfers[0].from === '0x0000000000000000000000000000000000000000') {
        transaction.transactionType = 'nftMint';
      }
      return transaction;
      // if transaction has erc20 transfers
    } else if (transaction.erc20Transfers.length > 0) {
      transaction.transactionType = 'erc20Transfer';
      transaction.fromAddress = transaction.erc20Transfers[0].from;
      transaction.toAddress = transaction.erc20Transfers[0].to;
      return transaction;
    } else {
      // if transaction has value, then it is an eth transfer
      if (transaction.txs[0].value > 0) {
        transaction.transactionType = 'ethTransfer';
        transaction.fromAddress = transaction.txs[0].fromAddress;
        transaction.toAddress = transaction.txs[0].toAddress;
        return transaction;
      } else {
        transaction.transactionType = 'contractCall';
        transaction.fromAddress = transaction.txs[0].fromAddress;
        transaction.toAddress = transaction.txs[0].toAddress;
        return transaction;
      }
    }
  } catch (error) {
    console.log('detectTransactionType error');
    console.log(error);
  }
}

function getTransactionMessageForSender(transaction, from) {
  if (transaction.transactionType === 'nftMint') {
    return {
      uniqueId: from,
      title: '🌠 NFT Minted',
      message: `You minted an NFT (${transaction.nftTransfers[0].tokenName}) on ${getChainName(transaction.chainId)}`,
    }
  } else if (transaction.transactionType === 'nftTransfer') {
    return {
      uniqueId: from,
      title: '🌠 NFT Sent',
      message: `You sent ${transaction.nftTransfers[0].tokenName} to ${addressAbbreviation(transaction.nftTransfers[0].to)} on ${getChainName(transaction.chainId)}`,
    }
  } else if (transaction.transactionType === 'erc20Transfer') {
    if (transaction.erc20Transfers[0].from === '0x0000000000000000000000000000000000000000') {
      return {
        uniqueId: from,
        title: `💰 Received: ${transaction.erc20Transfers[0].value / 10 ** transaction.erc20Transfers[0].tokenDecimals} ${transaction.erc20Transfers[0].tokenSymbol}`,
        message: `You received ${transaction.erc20Transfers[0].value / 10 ** transaction.erc20Transfers[0].tokenDecimals} ${transaction.erc20Transfers[0].tokenName} on ${getChainName(transaction.chainId)}`,
      }
    } else {
      return {
        uniqueId: from,
        title: `💸 Sent: ${transaction.erc20Transfers[0].value / 10 ** transaction.erc20Transfers[0].tokenDecimals} ${transaction.erc20Transfers[0].tokenSymbol}`,
        message: `You sent ${transaction.erc20Transfers[0].value / 10 ** transaction.erc20Transfers[0].tokenDecimals} ${transaction.erc20Transfers[0].tokenName} to ${addressAbbreviation(transaction.erc20Transfers[0].to)} on ${getChainName(transaction.chainId)}`,
      }
    }
  } else if (transaction.transactionType === 'ethTransfer') {
    return {
      uniqueId: from,
      title: `💸 Sent: ${fromWei(transaction.txs[0].value, 'ether')} ${getSymbol(transaction.chainId)}`,
      message: `You sent ${fromWei(transaction.txs[0].value, 'ether')} ${getSymbol(transaction.chainId)} to ${addressAbbreviation(transaction.txs[0].toAddress)} on ${getChainName(transaction.chainId)}`,
    }
  } else if (transaction.transactionType === 'contractCall') {
    return {
      uniqueId: from,
      title: '📝 Smart Contract Call',
      message: `Smart contract call executed on ${getChainName(transaction.chainId)}`,
    }
  }
}

function getTransactionMessageForReceiver(transaction, to) {
  if (transaction.transactionType === 'nftMint') {
    return {
      uniqueId: to,
      title: '🌠 NFT Minted',
      message: `You have minted an NFT (${transaction.nftTransfers[0].tokenName}) on ${getChainName(transaction.chainId)}`,
    }
  } else if (transaction.transactionType === 'nftTransfer') {
    return {
      uniqueId: to,
      title: '🌠 NFT Received',
      message: `You received an NFT (${transaction.nftTransfers[0].tokenName}) from ${addressAbbreviation(transaction.nftTransfers[0].from)} on ${getChainName(transaction.chainId)}`,
    }
  } else if (transaction.transactionType === 'erc20Transfer') {
    return {
      uniqueId: to,
      title: `💰 Received: ${transaction.erc20Transfers[0].value / 10 ** transaction.erc20Transfers[0].tokenDecimals} ${transaction.erc20Transfers[0].tokenSymbol}`,
      message: `You received ${transaction.erc20Transfers[0].value / 10 ** transaction.erc20Transfers[0].tokenDecimals} ${transaction.erc20Transfers[0].tokenName} from ${addressAbbreviation(transaction.erc20Transfers[0].from)} on ${getChainName(transaction.chainId)}`,
    }
  } else if (transaction.transactionType === 'ethTransfer') {
    return {
      uniqueId: to,
      title: `💰 Received: ${fromWei(transaction.txs[0].value, 'ether')} ${getSymbol(transaction.chainId)}`,
      message: `You received ${fromWei(transaction.txs[0].value, 'ether')} ${getSymbol(transaction.chainId)} from ${addressAbbreviation(transaction.txs[0].fromAddress)} on ${getChainName(transaction.chainId)}`,
    }
  } else if (transaction.transactionType === 'contractCall') {
    return {
      uniqueId: to,
      title: '📝 Smart Contract Call',
      message: `Smart contract call executed on ${getChainName(transaction.chainId)}`,
    }
  }
}

function getChainName(chainId) {
  switch (chainId) {
    case "0x1":
      return 'Ethereum Mainnet';
    case "0x5":
      return 'Goerli Testnet';
    case "0xaa36a7":
      return 'Sepolia Testnet';
    case "0x89":
      return 'Polygon Mainnet';
    case "0x13881":
      return 'Mumbai Testnet';
    case "0x38":
      return 'BNB Mainnet';
    case "0x61":
      return 'BNB Testnet';
    case "0xa4b1":
      return 'Arbitrum Mainnet';
    case "0x66eed":
      return 'Arbitrum Testnet';
    case "0xa86a":
      return 'Avalanche Mainnet';
    case "0xa869":
      return 'Avalanche Fuji Testnet';
    case "0xfa":
      return 'Fantom Mainnet';
    case "0xfa2":
      return 'Fantom Testnet';
    case "0x19":
      return 'Cronos Mainnet';
    case "0x152":
      return 'Cronos Testnet';
    case "0x7e4":
      return 'Ronin Mainnet';
    case "0xa":
      return 'Optimism Mainnet';
    case "2a15c308d":
      return 'Palm Mainnet';
    default:
      return 'Unknown';
  }
}

function getSymbol(chainId) {
  switch (chainId) {
    case "0x1":
      return 'ETH';
    case "0x5":
      return 'ETH';
    case "0xaa36a7":
      return 'ETH';
    case "0x89":
      return 'MATIC';
    case "0x13881":
      return 'MATIC';
    case "0x38":
      return 'BNB';
    case "0x61":
      return 'BNB';
    case "0xa4b1":
      return 'ETH';
    case "0x66eed":
      return 'ETH';
    case "0xa86a":
      return 'AVAX';
    case "0xa869":
      return 'AVAX';
    case "0xfa":
      return 'FTM';
    case "0xfa2":
      return 'FTM';
    case "0x19":
      return 'CRO';
    case "0x152":
      return 'CRO';
    case "0x7e4":
      return 'RON';
    case "0xa":
      return 'OP';
    case "2a15c308d":
      return 'PALM';
    default:
      return 'Unknown';
  }
}

function fromWei(wei, unit) {
  if (unit === 'ether') {
    return wei / 1000000000000000000;
  }
}

function addressAbbreviation(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}