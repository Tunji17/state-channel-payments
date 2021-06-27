const abi = require('ethereumjs-abi');
const util = require('ethereumjs-util');

//============================================================================
// UTILITY FUNCTIONS
//============================================================================

const constructPaymentMessage = async function (contractAddress, firstUserbalance, secondUserBalance, nonce) {
  return abi.soliditySHA3(
    ["address", "uint256", "uint256", "uint8"],
    [contractAddress, firstUserbalance, secondUserBalance, nonce]
  );
}

const signMessage = async function (web3, message, accountAddress) {
  return await web3.eth.sign(
    `0x${message.toString("hex")}`,
    accountAddress,
  );
}

const isValidSignature = async function (contractAddress, firstUserbalance, secondUserBalance, signature, expectedSigner, nonce) {
  let message = await constructPaymentMessage(contractAddress, firstUserbalance, secondUserBalance, nonce);
  let prefixedMessage = await prefixed(message);
  let signer = await recoverSigner(prefixedMessage, signature);
  return signer.toLowerCase() === util.stripHexPrefix(expectedSigner).toLowerCase();
}

const getEvent = async function (event, result) {
  for (let i = 0; i < result.logs.length; i++) {
    const log = result.logs[i];

    if (log.event === event) {
      return log;
    }
  }
  return undefined;
}

const assertFail = async function (promise, message) {
  try {
    await promise;
    assert(false);
  } catch (e) {
    if (e.name == 'AssertionError') {
      if (message)
        assert(false, message);
      else
        assert(false);
    }
  }
}

//============================================================================
// INTERNAL UTILITY FUNCTIONS
//============================================================================

async function prefixed(hash) {
  return abi.soliditySHA3(
    ["string", "bytes32"],
    ["\x19Ethereum Signed Message:\n32", hash]
  );
}

async function recoverSigner(message, signature) {
  let split = util.fromRpcSig(signature);
  let publicKey = util.ecrecover(message, split.v, split.r, split.s);
  let signer = util.pubToAddress(publicKey).toString("hex");
  return signer;
}

module.exports = {
  constructPaymentMessage,
  signMessage,
  isValidSignature,
  getEvent,
  assertFail,
}