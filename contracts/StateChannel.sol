// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract StateChannel {
    using SafeMath for uint256;

    address payable public sender;      // The account sending payments.
    address payable public recipient;   // The account receiving the payments.
    uint256 public expiration;  // Timeout in case the recipient never closes.

    //============================================================================
    // EVENTS
    //============================================================================

    event ChannelOpened(address sender, address recipient, uint expiration, uint256 deposit);
    event ChannelClosed(uint256 senderBalance, uint256 recipientBalance);

    constructor (address payable _recipient, uint256 duration)
        payable
    {
        require(msg.value > 0);
        require(msg.sender != _recipient);

        sender = payable(msg.sender);
        recipient = _recipient;
        expiration = block.timestamp + duration;

        emit ChannelOpened(sender, recipient, expiration, msg.value);
    }

    function isValidSignature(uint256 amount, bytes memory signature)
        internal
        view
        returns (bool)
    {
        bytes32 message = prefixed(keccak256(abi.encodePacked(address(this), amount)));
        // check that the signature is from the payment sender
        return recoverSigner(message, signature) == sender;
    }

    /// the recipient can close the channel at any time by presenting a
    /// signed amount from the sender. the recipient will be sent that amount,
    /// and the remainder will go back to the sender
    function close(uint256 amount, bytes memory signature) public {
        require(msg.sender == recipient);
        require(isValidSignature(amount, signature));

        uint256 balance = amount;
        uint256 remainder = 0;

        if (amount > address(this).balance) {
            balance = address(this).balance;
        } else {
            remainder = address(this).balance.sub(balance);
        }

        recipient.transfer(amount);
        emit ChannelClosed(remainder, balance);
        selfdestruct(sender);
    }

    /// the sender can extend the expiration at any time
    function extend(uint256 newExpiration) public {
        require(msg.sender == sender);
        require(newExpiration > expiration);

        expiration = newExpiration;
    }

    /// if the timeout is reached without the recipient closing the channel,
    /// then the Ether is released back to the sender.
    function claimTimeout() public {
        require(block.timestamp >= expiration);
        selfdestruct(sender);
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
