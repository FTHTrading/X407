/**
 * test/UNYToken.test.ts
 *
 * Hardhat / Mocha + Chai tests for UNYToken.
 * Run: npm test
 */

import { expect }  from "chai";
import { ethers }  from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { UNYToken }           from "../typechain-types";

const ONE_BILLION    = ethers.parseUnits("1000000000", 18);

describe("UNYToken", function () {
  let token:   UNYToken;
  let owner:   HardhatEthersSigner;
  let alice:   HardhatEthersSigner;
  let bob:     HardhatEthersSigner;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("UNYToken");
    token = (await Factory.deploy(owner.address)) as UNYToken;
    await token.waitForDeployment();
  });

  // ── Metadata ────────────────────────────────────────────────────────────────

  describe("Metadata", function () {
    it("has correct name", async function () {
      expect(await token.name()).to.equal("UnyKorn Token");
    });

    it("has correct symbol", async function () {
      expect(await token.symbol()).to.equal("UNY");
    });

    it("has 18 decimals", async function () {
      expect(await token.decimals()).to.equal(18);
    });
  });

  // ── Supply ───────────────────────────────────────────────────────────────────

  describe("Initial supply", function () {
    it("mints 1 billion UNY to the deployer", async function () {
      expect(await token.totalSupply()).to.equal(ONE_BILLION);
    });

    it("assigns the full supply to the initial owner", async function () {
      expect(await token.balanceOf(owner.address)).to.equal(ONE_BILLION);
    });

    it("INITIAL_SUPPLY constant equals actual total supply", async function () {
      expect(await token.INITIAL_SUPPLY()).to.equal(await token.totalSupply());
    });
  });

  // ── Transfers ────────────────────────────────────────────────────────────────

  describe("Transfers", function () {
    it("allows owner to transfer tokens", async function () {
      const amount = ethers.parseUnits("1000", 18);
      await token.connect(owner).transfer(alice.address, amount);
      expect(await token.balanceOf(alice.address)).to.equal(amount);
    });

    it("emits Transfer event on transfer", async function () {
      const amount = ethers.parseUnits("500", 18);
      await expect(token.connect(owner).transfer(alice.address, amount))
        .to.emit(token, "Transfer")
        .withArgs(owner.address, alice.address, amount);
    });

    it("reverts when transferring more than balance", async function () {
      const amount = ONE_BILLION + 1n;
      await expect(token.connect(owner).transfer(alice.address, amount))
        .to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
    });
  });

  // ── Allowances ───────────────────────────────────────────────────────────────

  describe("Allowances (approve / transferFrom)", function () {
    it("allows approve and transferFrom", async function () {
      const amount = ethers.parseUnits("200", 18);
      await token.connect(owner).approve(alice.address, amount);
      expect(await token.allowance(owner.address, alice.address)).to.equal(amount);

      await token.connect(alice).transferFrom(owner.address, bob.address, amount);
      expect(await token.balanceOf(bob.address)).to.equal(amount);
    });

    it("reverts transferFrom when allowance is exceeded", async function () {
      const amount = ethers.parseUnits("100", 18);
      await token.connect(owner).approve(alice.address, amount);
      await expect(
        token.connect(alice).transferFrom(owner.address, bob.address, amount + 1n)
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
    });
  });

  // ── Burning ──────────────────────────────────────────────────────────────────

  describe("Burning", function () {
    it("allows a holder to burn their own tokens", async function () {
      const burnAmt = ethers.parseUnits("1000000", 18);
      await token.connect(owner).burn(burnAmt);
      expect(await token.totalSupply()).to.equal(ONE_BILLION - burnAmt);
      expect(await token.balanceOf(owner.address)).to.equal(ONE_BILLION - burnAmt);
    });

    it("emits Transfer to zero address on burn", async function () {
      const burnAmt = ethers.parseUnits("1", 18);
      await expect(token.connect(owner).burn(burnAmt))
        .to.emit(token, "Transfer")
        .withArgs(owner.address, ethers.ZeroAddress, burnAmt);
    });

    it("allows burnFrom with allowance", async function () {
      const amount = ethers.parseUnits("50", 18);
      await token.connect(owner).approve(alice.address, amount);
      await token.connect(alice).burnFrom(owner.address, amount);
      expect(await token.totalSupply()).to.equal(ONE_BILLION - amount);
    });
  });

  // ── Ownership ─────────────────────────────────────────────────────────────────

  describe("Ownership", function () {
    it("sets the correct initial owner", async function () {
      expect(await token.owner()).to.equal(owner.address);
    });

    it("allows owner to transfer ownership", async function () {
      await token.connect(owner).transferOwnership(alice.address);
      expect(await token.owner()).to.equal(alice.address);
    });

    it("allows owner to renounce ownership", async function () {
      await token.connect(owner).renounceOwnership();
      expect(await token.owner()).to.equal(ethers.ZeroAddress);
    });

    it("reverts when non-owner calls transferOwnership", async function () {
      await expect(
        token.connect(alice).transferOwnership(bob.address)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });
  });
});
