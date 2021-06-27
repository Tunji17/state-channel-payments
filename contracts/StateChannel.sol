// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract StateChannel {
    using SafeMath for uint256;

    address payable public firstUser;      // The account sending payments.
    address payable public secondUser;   // The account receiving the payments.
    uint256 public expiration;  // Timeout in case the secondUser never closes.
    uint8 public nonce; // Nonce value for transaction

    //============================================================================
    // EVENTS
    //============================================================================

    event ChannelOpened(address firstUser, address secondUser, uint expiration, uint256 deposit);
    event ChannelClosed(uint256 firstUserBalance, uint256 secondUserBalance);
    event NonceUpdated(uint256 firstUserBalance, uint256 secondUserBalance, bytes signature, uint8 nonce);

    constructor (address payable _secondUser, uint256 duration)
        payable
    {
        require(msg.value > 0);
        require(msg.sender != _secondUser);

        firstUser = payable(msg.sender);
        secondUser = _secondUser;
        expiration = block.timestamp + duration;
        nonce = 0;

        emit ChannelOpened(firstUser, secondUser, expiration, msg.value);
    }

    function isValidSignature(uint256 firstUserBalance, uint256 secondUserBalance, bytes memory signature, uint8 _nonce)
        internal
        view
        returns (bool)
    {
        bytes32 message = prefixed(keccak256(abi.encodePacked(address(this), firstUserBalance, secondUserBalance, _nonce)));
        // check that the signature is from the firstUser or second user
        return recoverSigner(message, signature) == firstUser || recoverSigner(message, signature) == secondUser;
    }

    function challenge(uint256 firstUserBalance, uint256 secondUserBalance, bytes memory signature, uint8 _nonce) public {
        require(msg.sender == firstUser || msg.sender == secondUser);
        require(isValidSignature(firstUserBalance, secondUserBalance, signature, _nonce));
        require(_nonce > nonce);
        nonce = _nonce;
        emit NonceUpdated(firstUserBalance, secondUserBalance, signature, _nonce);
    }


    /// the Any of the participants can close the channel at any time by presenting a
    /// signed transaction with a valid nonce. the closing amount would be paid out to each
    /// participant and any remainder will go back to the firstUser
    function close(uint256 firstUserBalance, uint256 secondUserBalance, bytes memory signature, uint8 _nonce) public {
        require(msg.sender == firstUser || msg.sender == secondUser);
        require(isValidSignature(firstUserBalance, secondUserBalance, signature, _nonce));
        require(_nonce == nonce);
        require(address(this).balance > firstUserBalance.add(secondUserBalance));
        firstUser.transfer(firstUserBalance);
        secondUser.transfer(secondUserBalance);
        emit ChannelClosed(firstUserBalance, secondUserBalance);
        selfdestruct(firstUser);
    }

    /// the participants can extend the expiration at any time
    function extend(uint256 newExpiration) public {
        require(msg.sender == firstUser  || msg.sender == secondUser);
        require(newExpiration > expiration);

        expiration = newExpiration;
    }

    /// if the timeout is reached without the secondUser closing the channel,
    /// then the Ether is released back to the firstUser.
    function claimTimeout() public {
        require(block.timestamp >= expiration);
        selfdestruct(firstUser);
    }

    function splitSignature(bytes memory sig)
        internal
        pure
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        require(sig.length == 65);

        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := and(mload(add(sig, 65)), 255)
        }
        if (v < 27) v += 27;
        return (v, r, s);
    }

    function recoverSigner(bytes32 message, bytes memory sig)
        internal
        pure
        returns (address)
    {
        (uint8 v, bytes32 r, bytes32 s) = splitSignature(sig);

        return ecrecover(message, v, r, s);
    }

    /// builds a prefixed hash to mimic the behavior of eth_sign.
    function prefixed(bytes32 hash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
    }
}
