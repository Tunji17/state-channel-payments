const StateChannel = artifacts.require('./StateChannel.sol');
const utils = require('./utils.js');


contract('StateChannel', accounts => {

  let statechannel;
  let firstUser = accounts[0];
  let secondUser = accounts[1];
  let deposit = web3.utils.toWei('5', 'ether');
  let signatures = [];
  let currentTime;

  describe('constructor', () => {

    before(async () => {
      currentTime = Math.floor(new Date().getTime() / 1000);
      statechannel = await StateChannel.new(secondUser, 60, { from: firstUser, value: deposit });
    });

    it('emits ChannelOpened event', async () => {
      assert.ok(utils.getEvent('ChannelOpened', await web3.eth.getTransactionReceipt(statechannel.transactionHash)), 'should log an ChannelOpened event');
    });

    it('sets the correct firstUser', async () => {
      assert(firstUser == await statechannel.firstUser.call());
    });

    it('sets the correct secondUser', async () => {
      assert(secondUser == await statechannel.secondUser.call());
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
      statechannel = await StateChannel.new(secondUser, 1, { from: firstUser, value: deposit });
    });

    it('cannot update expiration to be earlier', async () => {
      await utils.assertFail(statechannel.extend(currentTime, { from: firstUser }));
    });


    it('updates contract expiration', async () => {
      await statechannel.extend(currentTime + 10, { from: firstUser });
      assert((currentTime + 10) == await statechannel.expiration.call());
    });
  });

  describe('claimTimeout', () => {

    before(async () => {
      statechannel = await StateChannel.new(secondUser, 1, { from: firstUser, value: deposit });
    });

    it('can only be called after contract expiry', async () => {
      await utils.assertFail(statechannel.claimTimeout({ from: firstUser }));
    });

    it('returns balance to firstUser', async () => {
      let firstUserBalance = await web3.eth.getBalance(firstUser);
      await new Promise(resolve => setTimeout(resolve, 1000));
      await statechannel.claimTimeout({ from: firstUser });
      let updatedfirstUserBalance = await web3.eth.getBalance(firstUser);
      assert(parseInt(firstUserBalance) < parseInt(updatedfirstUserBalance));
    });
  });

  describe('closeChannel', () => {

    let firstUserBalance;
    let secondUserBalance;

    before(async () => {
      statechannel = await StateChannel.new(secondUser, 1, { from: firstUser, value: deposit });
      // generate valid signature on the client
      let message = await utils.constructPaymentMessage(statechannel.address, web3.utils.toWei('1', 'ether'), web3.utils.toWei('3', 'ether'), 1);
      let signature = await utils.signMessage(web3, message, firstUser);
      signatures.push(signature);
      // validate signature
      assert(await utils.isValidSignature(statechannel.address, web3.utils.toWei('1', 'ether'), web3.utils.toWei('3', 'ether'), signature, firstUser, 1));
      firstUserBalance = await web3.eth.getBalance(firstUser);
      secondUserBalance = await web3.eth.getBalance(secondUser);
    });

    it('cannot be called with invalid User balance', async () => {
      await utils.assertFail(statechannel.close(web3.utils.toWei('12', 'ether'), web3.utils.toWei('1', 'ether'), signatures[signatures.length - 1], 1, { from: secondUser }));
    });

    it('settle transaction onchain', async () => {
      let tx = await statechannel.challenge(web3.utils.toWei('1', 'ether'), web3.utils.toWei('3', 'ether'), signatures[signatures.length - 1], 1, { from: secondUser });
      assert.ok(utils.getEvent('ChannelClosed', tx), 'should log an ChannelClosed event');
    });
    it('emits a ChannelClosed event', async () => {
      let tx = await statechannel.close(web3.utils.toWei('1', 'ether'), web3.utils.toWei('3', 'ether'), signatures[signatures.length - 1], 1, { from: secondUser });
      assert.ok(utils.getEvent('ChannelClosed', tx), 'should log an ChannelClosed event');
    });

    it('remits payment to firstUser', async () => {
      let firstUserNewBalance = await web3.eth.getBalance(firstUser)
      assert(parseInt(firstUserBalance) < parseInt(firstUserNewBalance));
    });

    it('remits payment to secondUser', async () => {
      let secondUserNewBalance = await web3.eth.getBalance(secondUser)
      assert(parseInt(secondUserBalance) < parseInt(secondUserNewBalance));
    });
  });
});
