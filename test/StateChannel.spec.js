const StateChannel = artifacts.require('./StateChannel.sol');
const utils = require('./utils.js');


contract('StateChannel', accounts => {

  let statechannel;
  let sender = accounts[0];
  let recipient = accounts[1];
  let deposit = web3.utils.toWei('5', 'ether');
  let signatures = [];
  let currentTime;

  describe('constructor', () => {

    before(async () => {
      currentTime = Math.floor(new Date().getTime() / 1000);
      statechannel = await StateChannel.new(recipient, 60, { from: sender, value: deposit });
    });

    it('emits ChannelOpened event', async () => {
      assert.ok(utils.getEvent('ChannelOpened', await web3.eth.getTransactionReceipt(statechannel.transactionHash)), 'should log an ChannelOpened event');
    });

    it('sets the correct sender', async () => {
      assert(sender == await statechannel.sender.call());
    });

    it('sets the correct recipient', async () => {
      assert(recipient == await statechannel.recipient.call());
    });

    it('sets the correct expiration', async () => {
      assert((currentTime + 60) == await statechannel.expiration.call());
    });

    it('sets the correct balance', async () => {
      assert(deposit == await web3.eth.getBalance(statechannel.address));
    });
  });

  describe('extendExpiration', () => {

    before(async () => {
      currentTime = Math.floor(new Date().getTime() / 1000);
      statechannel = await StateChannel.new(recipient, 1, { from: sender, value: deposit });
    });

    it('cannot update expiration to be earlier', async () => {
      await utils.assertFail(statechannel.extend(currentTime, { from: sender }));
    });

    it('can only be called by sender', async () => {
      await utils.assertFail(statechannel.extend(currentTime + 10, { from: recipient }));
    });

    it('updates contract expiration', async () => {
      await statechannel.extend(currentTime + 10, { from: sender });
      assert((currentTime + 10) == await statechannel.expiration.call());
    });
  });

  describe('claimTimeout', () => {

    before(async () => {
      statechannel = await StateChannel.new(recipient, 1, { from: sender, value: deposit });
    });

    it('can only be called after contract expiry', async () => {
      await utils.assertFail(statechannel.claimTimeout({ from: sender }));
    });

    it('returns balance to sender', async () => {
      let senderBalance = await web3.eth.getBalance(sender);
      let stateChannelBalance = await web3.eth.getBalance(statechannel.address);
      await new Promise(resolve => setTimeout(resolve, 1000));
      await statechannel.claimTimeout({ from: sender });
      let updatedSenderBalance = await web3.eth.getBalance(sender);
      assert(parseInt(senderBalance) + parseInt(stateChannelBalance) - 2e15 < parseInt(updatedSenderBalance));
    });
  });

  describe('closeChannel', () => {

    let senderBalance;
    let recipientBalance;

    before(async () => {
      statechannel = await StateChannel.new(recipient, 1, { from: sender, value: deposit });
      // generate valid signature on the client
      let message = await utils.constructPaymentMessage(statechannel.address, web3.utils.toWei('1', 'ether'));
      let signature = await utils.signMessage(web3, message, sender);
      signatures.push(signature);
      // validate signature
      assert(await utils.isValidSignature(statechannel.address, web3.utils.toWei('1', 'ether'), signature, sender));

      // save sender and recipient balance
      senderBalance = await web3.eth.getBalance(sender);
      recipientBalance = await web3.eth.getBalance(recipient);
    });

    it('cannot be called with invalid recipient balance', async () => {
      await utils.assertFail(statechannel.close(web3.utils.toWei('12', 'ether'), signatures[signatures.length - 1], { from: recipient }));
    });

    it('cannot be called by the sender', async () => {
      await utils.assertFail(statechannel.close(web3.utils.toWei('1', 'ether'), signatures[signatures.length - 1], { from: sender }));
    });

    it('emits a ChannelClosed event', async () => {
      let tx = await statechannel.close(web3.utils.toWei('1', 'ether'), signatures[signatures.length - 1], { from: recipient });
      assert.ok(utils.getEvent('ChannelClosed', tx), 'should log an ChannelClosed event');
    });

    it('remits payment to sender', async () => {
      let senderNewBalance = await web3.eth.getBalance(sender)
      assert(parseInt(senderBalance) + parseInt(web3.utils.toWei('4', 'ether')) - 8e15 < parseInt(senderNewBalance));
    });

    it('remits payment to recipient', async () => {
      let recipientNewBalance = await web3.eth.getBalance(recipient)
      assert(parseInt(recipientBalance) + parseInt(web3.utils.toWei('1', 'ether')) - 8e15 < parseInt(recipientNewBalance));
    });
  });
});
