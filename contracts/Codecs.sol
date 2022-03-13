// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.12;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/ICodec.sol";

abstract contract Codecs is Ownable {
    // Initially supported swap functions
    // 0x3df02124 exchange(int128,int128,uint256,uint256)
    // 0x38ed1739 swapExactTokensForTokens(uint256,uint256,address[],address,uint256)
    // 0x41060ae0 exactInputSingle(address,address,uint24,address,uint256,uint256,uint256,uint160)
    mapping(bytes4 => ICodec) public selector2codec;

    // not used programmatically, but added for contract transparency
    address[] public codecs;

    constructor(string[] memory _funcSigs, address[] memory _codecs) {
        require(_funcSigs.length == _codecs.length, "length mismatch");
        for (uint256 i = 0; i < _funcSigs.length; i++) {
            _setCodec(_funcSigs[i], _codecs[i]);
        }
    }

    function setCodec(string calldata _funcSig, address _codec) public onlyOwner {
        _setCodec(_funcSig, _codec);
    }

    function _setCodec(string memory _funcSig, address _codec) private {
        bytes4 selector = bytes4(keccak256(bytes(_funcSig)));
        selector2codec[selector] = ICodec(_codec);
        codecs.push(_codec);
    }

    function loadCodecs(ICodec.SwapDescription[] memory _swaps) internal view returns (ICodec[] memory) {
        ICodec[] memory _codecs = new ICodec[](_swaps.length);
        for (uint256 i = 0; i < _swaps.length; i++) {
            bytes4 selector = bytes4(_swaps[i].data);
            _codecs[i] = selector2codec[selector];
            require(address(_codecs[i]) != address(0), "codec not found");
        }
        return (_codecs);
    }

    function getCodec(
        bytes4[] memory _selectors,
        ICodec[] memory _codecs,
        bytes4 _selector
    ) internal pure returns (ICodec) {
        for (uint256 i = 0; i < _codecs.length; i++) {
            if (_selector == _selectors[i]) {
                return _codecs[i];
            }
        }
        revert("cdc no found");
    }
}
