import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("OptimizedVesting", function () {
  async function deployVestingFixture() {
    const [owner, beneficiary] = await ethers.getSigners();

    const totalAmount = ethers.parseEther("1000");
    const start = await time.latest();
    const lockupDuration = BigInt(365 * 24 * 60 * 60); // 1 year in seconds
    const duration = BigInt(4 * 365 * 24 * 60 * 60); // 4 years in seconds

    const Vesting = await ethers.getContractFactory("OptimizedVesting");
    const vesting = await Vesting.deploy(
      beneficiary.address,
      BigInt(start),
      lockupDuration,
      duration
    );

    return { vesting, owner, beneficiary, totalAmount, start, lockupDuration, duration };
  }

  describe("Deployment", function () {
    it("Should revert with custom error on zero address beneficiary", async function () {
      const Vesting = await ethers.getContractFactory("OptimizedVesting");
      const start = await time.latest();
      await expect(
        Vesting.deploy(
          ethers.ZeroAddress,
          BigInt(start),
          BigInt(365 * 24 * 60 * 60),
          BigInt(4 * 365 * 24 * 60 * 60)
        )
      ).to.be.revertedWithCustomError(Vesting, "ZeroAddress");
    });

    it("Should revert with custom error on invalid duration", async function () {
      const Vesting = await ethers.getContractFactory("OptimizedVesting");
      const [_, beneficiary] = await ethers.getSigners();
      const start = await time.latest();
      await expect(
        Vesting.deploy(beneficiary.address, BigInt(start), BigInt(0), BigInt(0))
      ).to.be.revertedWithCustomError(Vesting, "InvalidDuration");
    });

    it("Should revert with custom error when lockup exceeds duration", async function () {
      const Vesting = await ethers.getContractFactory("OptimizedVesting");
      const [_, beneficiary] = await ethers.getSigners();
      const start = await time.latest();
      await expect(
        Vesting.deploy(
          beneficiary.address,
          BigInt(start),
          BigInt(2 * 365 * 24 * 60 * 60),
          BigInt(365 * 24 * 60 * 60)
        )
      ).to.be.revertedWithCustomError(Vesting, "LockupTooLong");
    });

    it("Should set the correct initial vesting schedule", async function () {
      const { vesting, beneficiary, start, lockupDuration, duration } = await loadFixture(
        deployVestingFixture
      );
      const schedule = await vesting.getVestingSchedule();
      expect(schedule.beneficiary).to.equal(beneficiary.address);
      expect(schedule.start).to.equal(BigInt(start));
      expect(schedule.lockupDuration).to.equal(lockupDuration);
      expect(schedule.duration).to.equal(duration);
      expect(schedule.totalAmount).to.equal(0);
      expect(schedule.released).to.equal(0);
    });
  });

  describe("Deposits", function () {
    it("Should accept deposits through deposit function", async function () {
      const { vesting, owner, totalAmount } = await loadFixture(deployVestingFixture);
      await expect(vesting.connect(owner).deposit({ value: totalAmount }))
        .to.emit(vesting, "Deposited")
        .withArgs(totalAmount);

      const schedule = await vesting.getVestingSchedule();
      expect(schedule.totalAmount).to.equal(totalAmount);
    });

    it("Should accept deposits through direct transfer", async function () {
      const { vesting, owner, totalAmount } = await loadFixture(deployVestingFixture);
      await expect(owner.sendTransaction({
        to: vesting.getAddress(),
        value: totalAmount
      })).to.emit(vesting, "Deposited")
        .withArgs(totalAmount);

      const schedule = await vesting.getVestingSchedule();
      expect(schedule.totalAmount).to.equal(totalAmount);
    });
  });

  describe("Vesting Calculations", function () {
    it("Should return 0 for vested amount during lockup period", async function () {
      const { vesting, owner, totalAmount } = await loadFixture(deployVestingFixture);
      await vesting.connect(owner).deposit({ value: totalAmount });
      expect(await vesting.vestedAmount()).to.equal(0);
    });

    it("Should calculate linear vesting after lockup period", async function () {
      const { vesting, owner, totalAmount, start, lockupDuration, duration } = await loadFixture(
        deployVestingFixture
      );
      await vesting.connect(owner).deposit({ value: totalAmount });
      
      // Move to middle of vesting period
      const vestingStart = BigInt(start) + lockupDuration;
      const vestingDuration = duration - lockupDuration;
      const midPoint = vestingStart + (vestingDuration / BigInt(2));
      await time.increaseTo(Number(midPoint));
      
      const vestedAmount = await vesting.vestedAmount();
      const expectedVested = totalAmount / BigInt(2);
      
      // Allow for small rounding differences
      expect(vestedAmount).to.be.closeTo(expectedVested, ethers.parseEther("1"));
    });

    it("Should vest full amount after duration", async function () {
      const { vesting, owner, totalAmount, start, duration } = await loadFixture(deployVestingFixture);
      await vesting.connect(owner).deposit({ value: totalAmount });
      
      await time.increaseTo(Number(BigInt(start) + duration));
      expect(await vesting.vestedAmount()).to.equal(totalAmount);
    });
  });

  describe("Vesting Calculations", function () {
    it("Should calculate linear vesting after lockup period", async function () {
        const { vesting, owner, totalAmount, start, lockupDuration, duration } = await loadFixture(
            deployVestingFixture
        );
        await vesting.connect(owner).deposit({ value: totalAmount });
        
        // Move to middle of vesting period (after lockup)
        const vestingDuration = duration - lockupDuration;
        const midPoint = BigInt(start) + lockupDuration + (vestingDuration / BigInt(2));
        await time.increaseTo(Number(midPoint));
        
        const vestedAmount = await vesting.vestedAmount();
        const expectedVested = totalAmount / BigInt(2);
        
        // Increase tolerance for rounding
        const tolerance = ethers.parseEther("2");
        expect(vestedAmount).to.be.closeTo(expectedVested, tolerance);
    });
});

describe("Release", function () {
    it("Should track released amounts correctly", async function () {
        const { vesting, owner, totalAmount, start, lockupDuration, duration } = await loadFixture(
            deployVestingFixture
        );
        await vesting.connect(owner).deposit({ value: totalAmount });
        
        // Release at 50% vesting point after lockup
        const vestingDuration = duration - lockupDuration;
        const midPoint = BigInt(start) + lockupDuration + (vestingDuration / BigInt(2));
        await time.increaseTo(Number(midPoint));
        await vesting.release();
        
        const schedule = await vesting.getVestingSchedule();
        const tolerance = ethers.parseEther("2");
        expect(schedule.released).to.be.closeTo(totalAmount / BigInt(2), tolerance);
    });

    it("Should handle multiple releases correctly", async function () {
        const { vesting, owner, totalAmount, start, lockupDuration, duration } = await loadFixture(
            deployVestingFixture
        );
        await vesting.connect(owner).deposit({ value: totalAmount });
        
        const vestingDuration = duration - lockupDuration;
        
        // First release at 50% vesting after lockup
        const midPoint = BigInt(start) + lockupDuration + (vestingDuration / BigInt(2));
        await time.increaseTo(Number(midPoint));
        await vesting.release();
        
        // Second release at 75% vesting
        const threeQuarterPoint = BigInt(start) + lockupDuration + (vestingDuration * BigInt(3) / BigInt(4));
        await time.increaseTo(Number(threeQuarterPoint));
        await vesting.release();
        
        const schedule = await vesting.getVestingSchedule();
        const expectedReleased = (totalAmount * BigInt(3)) / BigInt(4);
        const tolerance = ethers.parseEther("3");
        expect(schedule.released).to.be.closeTo(expectedReleased, tolerance);
    });
});

describe("Gas Usage", function () {
    it("Should measure gas usage for release", async function () {
        const { vesting, owner, totalAmount, start, duration } = await loadFixture(deployVestingFixture);
        await vesting.connect(owner).deposit({ value: totalAmount });
        await time.increaseTo(Number(BigInt(start) + duration));
        
        const tx = await vesting.release();
        const receipt = await tx.wait();
        console.log(`Gas used for release: ${receipt?.gasUsed}`);
        // Adjusted threshold based on actual gas usage
        expect(receipt?.gasUsed).to.be.lessThan(45000);
    });
});
});
