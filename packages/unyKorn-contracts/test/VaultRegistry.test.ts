/**
 * test/VaultRegistry.test.ts
 */

import { expect }  from "chai";
import { ethers }  from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { VaultRegistry }       from "../typechain-types";

const EntryType = { TOKEN: 0, VAULT: 1, POOL: 2, BRIDGE: 3, ORACLE: 4, DAO: 5, NFT: 6, OTHER: 7 };

const STUB_ADDR = ethers.getAddress("0xc09003213b34c7bec8d2eddfad4b43e51d007d66");
const META_URI  = "ipfs://QmPlaceholder";

describe("VaultRegistry", function () {
  let reg:   VaultRegistry;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, alice] = await ethers.getSigners();
    const Factory  = await ethers.getContractFactory("VaultRegistry");
    reg = (await Factory.deploy(owner.address)) as VaultRegistry;
    await reg.waitForDeployment();
  });

  // ── Deployment ────────────────────────────────────────────────────────────

  it("sets the correct owner", async function () {
    expect(await reg.owner()).to.equal(owner.address);
  });

  it("starts with zero entries", async function () {
    expect(await reg.entryCount()).to.equal(0n);
  });

  // ── addEntry ──────────────────────────────────────────────────────────────

  describe("addEntry", function () {
    it("adds an entry and emits EntryAdded", async function () {
      await expect(
        reg.connect(owner).addEntry("uny-token-43114", EntryType.TOKEN, STUB_ADDR, 43114, META_URI)
      )
        .to.emit(reg, "EntryAdded")
        .withArgs(ethers.keccak256(ethers.toUtf8Bytes("uny-token-43114")), STUB_ADDR, EntryType.TOKEN, 43114n);

      expect(await reg.entryCount()).to.equal(1n);
    });

    it("stores entry fields correctly", async function () {
      await reg.connect(owner).addEntry("test-pool", EntryType.POOL, STUB_ADDR, 43114, META_URI);
      const e = await reg.getEntry("test-pool");
      expect(e.contractAddr).to.equal(STUB_ADDR);
      expect(e.chainId).to.equal(43114n);
      expect(e.metadataUri).to.equal(META_URI);
      expect(e.verified).to.be.false;
      expect(e.entryType).to.equal(EntryType.POOL);
    });

    it("reverts on duplicate label", async function () {
      await reg.connect(owner).addEntry("dup-label", EntryType.TOKEN, STUB_ADDR, 43114, "");
      await expect(
        reg.connect(owner).addEntry("dup-label", EntryType.TOKEN, STUB_ADDR, 43114, "")
      ).to.be.revertedWithCustomError(reg, "LabelAlreadyExists");
    });

    it("reverts on zero address", async function () {
      await expect(
        reg.connect(owner).addEntry("zero-test", EntryType.TOKEN, ethers.ZeroAddress, 43114, "")
      ).to.be.revertedWithCustomError(reg, "ZeroAddress");
    });

    it("reverts on empty label", async function () {
      await expect(
        reg.connect(owner).addEntry("", EntryType.TOKEN, STUB_ADDR, 43114, "")
      ).to.be.revertedWithCustomError(reg, "EmptyLabel");
    });

    it("reverts when called by non-owner", async function () {
      await expect(
        reg.connect(alice).addEntry("non-owner", EntryType.TOKEN, STUB_ADDR, 43114, "")
      ).to.be.revertedWithCustomError(reg, "OwnableUnauthorizedAccount");
    });
  });

  // ── verify ────────────────────────────────────────────────────────────────

  describe("verify", function () {
    beforeEach(async function () {
      await reg.connect(owner).addEntry("v-entry", EntryType.VAULT, STUB_ADDR, 43114, "");
    });

    it("sets verified = true and emits EntryVerified", async function () {
      await expect(reg.connect(owner).verify("v-entry"))
        .to.emit(reg, "EntryVerified");
      expect((await reg.getEntry("v-entry")).verified).to.be.true;
    });

    it("reverts on unknown label", async function () {
      await expect(reg.connect(owner).verify("unknown"))
        .to.be.revertedWithCustomError(reg, "LabelNotFound");
    });
  });

  // ── updateMetadata ────────────────────────────────────────────────────────

  describe("updateMetadata", function () {
    const NEW_URI = "ipfs://QmUpdated";

    beforeEach(async function () {
      await reg.connect(owner).addEntry("meta-entry", EntryType.TOKEN, STUB_ADDR, 43114, META_URI);
    });

    it("updates the metadata URI", async function () {
      await expect(reg.connect(owner).updateMetadata("meta-entry", NEW_URI))
        .to.emit(reg, "MetadataUpdated")
        .withArgs(ethers.keccak256(ethers.toUtf8Bytes("meta-entry")), NEW_URI);
      expect((await reg.getEntry("meta-entry")).metadataUri).to.equal(NEW_URI);
    });
  });

  // ── removeEntry ───────────────────────────────────────────────────────────

  describe("removeEntry", function () {
    beforeEach(async function () {
      await reg.connect(owner).addEntry("del-entry", EntryType.OTHER, STUB_ADDR, 1, "");
    });

    it("removes the entry and decrements count", async function () {
      await expect(reg.connect(owner).removeEntry("del-entry"))
        .to.emit(reg, "EntryRemoved");
      expect(await reg.entryCount()).to.equal(0n);
    });

    it("reverts getEntry after removal", async function () {
      await reg.connect(owner).removeEntry("del-entry");
      await expect(reg.getEntry("del-entry"))
        .to.be.revertedWithCustomError(reg, "LabelNotFound");
    });
  });

  // ── getEntries (pagination) ───────────────────────────────────────────────

  describe("getEntries (pagination)", function () {
    beforeEach(async function () {
      const addrs = [
        "0x1000000000000000000000000000000000000001",
        "0x2000000000000000000000000000000000000002",
        "0x3000000000000000000000000000000000000003",
      ];
      for (let i = 0; i < addrs.length; i++) {
        await reg.connect(owner).addEntry(`entry-${i}`, EntryType.TOKEN, addrs[i], 43114, "");
      }
    });

    it("returns all 3 entries with from=0 to=3", async function () {
      const entries = await reg.getEntries(0, 3);
      expect(entries.length).to.equal(3);
    });

    it("paginates correctly (page size 2)", async function () {
      const page1 = await reg.getEntries(0, 2);
      const page2 = await reg.getEntries(2, 4);
      expect(page1.length).to.equal(2);
      expect(page2.length).to.equal(1); // capped at entryCount
    });

    it("returns empty array when from >= entryCount", async function () {
      const entries = await reg.getEntries(10, 20);
      expect(entries.length).to.equal(0);
    });
  });

  // ── exists ────────────────────────────────────────────────────────────────

  describe("exists", function () {
    it("returns true for registered label", async function () {
      await reg.connect(owner).addEntry("exists-check", EntryType.TOKEN, STUB_ADDR, 43114, "");
      expect(await reg.exists("exists-check")).to.be.true;
    });

    it("returns false for unknown label", async function () {
      expect(await reg.exists("nope")).to.be.false;
    });
  });
});
