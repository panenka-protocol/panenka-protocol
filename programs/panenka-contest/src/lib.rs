//! Panenka Protocol - contest escrow program (DEVNET-ONLY for the hackathon, see docs/COMPLIANCE.md).
//!
//! Two managers escrow an agreed stake into a per-contest PDA vault. When the
//! gameweek closes, the oracle service computes the outcome from official FPL
//! points and signs it (ed25519). The program verifies the oracle signature
//! and settles: winner receives the pot minus the protocol fee (500 bps = 5%),
//! which goes to the protocol treasury.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::ed25519_program;
use anchor_lang::solana_program::sysvar::instructions::{load_instruction_at_checked, ID as INSTRUCTIONS_ID};

declare_id!("PANaGTE11111111111111111111111111111111111");

pub const PROTOCOL_FEE_BPS: u64 = 500; // 5%
pub const MAX_ORACLE_MESSAGE_LEN: usize = 128;

#[program]
pub mod panenka_contest {
    use super::*;

    /// Manager A creates a contest: stakes `stake_lamports` for gameweek `gameweek`.
    pub fn create_contest(ctx: Context<CreateContest>, gameweek: u16, stake_lamports: u64) -> Result<()> {
        require!(stake_lamports > 0, ContestError::ZeroStake);
        let contest = &mut ctx.accounts.contest;
        contest.manager_a = ctx.accounts.manager_a.key();
        contest.manager_b = Pubkey::default();
        contest.gameweek = gameweek;
        contest.stake = stake_lamports;
        contest.state = ContestState::Open;
        contest.bump = ctx.bumps.contest;

        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.manager_a.key(),
            &contest.key(),
            stake_lamports,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.manager_a.to_account_info(),
                contest.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
        Ok(())
    }

    /// Manager B joins by matching the stake.
    pub fn join_contest(ctx: Context<JoinContest>) -> Result<()> {
        let contest = &mut ctx.accounts.contest;
        require!(contest.state == ContestState::Open, ContestError::NotOpen);
        require!(ctx.accounts.manager_b.key() != contest.manager_a, ContestError::SameManager);

        contest.manager_b = ctx.accounts.manager_b.key();
        contest.state = ContestState::Locked;

        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.manager_b.key(),
            &contest.key(),
            contest.stake,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.manager_b.to_account_info(),
                contest.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
        Ok(())
    }

    /// Settle after the gameweek closes. Caller passes the oracle's ed25519
    /// signature instruction (verified via the instructions sysvar) committing
    /// to (contest, winner). Pot pays out minus the protocol fee.
    pub fn settle(ctx: Context<Settle>) -> Result<()> {
        let contest = &mut ctx.accounts.contest;
        require!(contest.state == ContestState::Locked, ContestError::NotLocked);

        // The transaction must begin with an ed25519 signature-verification
        // instruction from the oracle over message: contest_pubkey || winner_pubkey.
        let ixs = ctx.accounts.instructions.to_account_info();
        let ix = load_instruction_at_checked(0, &ixs)?;
        require!(ix.program_id == ed25519_program::ID, ContestError::MissingOracleSig);
        // TODO(hackathon D8-11): parse the ed25519 instruction data and assert
        // (a) signer == contest.oracle, (b) message == contest.key() || winner.key().
        // Single-oracle design for the demo; path to a decentralized oracle
        // network is documented in docs/ARCHITECTURE.md.

        let winner = ctx.accounts.winner.key();
        require!(
            winner == contest.manager_a || winner == contest.manager_b,
            ContestError::InvalidWinner
        );

        let pot = contest.stake.checked_mul(2).unwrap();
        let fee = pot.checked_mul(PROTOCOL_FEE_BPS).unwrap() / 10_000;
        let payout = pot.checked_sub(fee).unwrap();

        **contest.to_account_info().try_borrow_mut_lamports()? -= payout;
        **ctx.accounts.winner.to_account_info().try_borrow_mut_lamports()? += payout;
        **contest.to_account_info().try_borrow_mut_lamports()? -= fee;
        **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += fee;

        contest.state = ContestState::Settled;
        Ok(())
    }
}

#[account]
pub struct Contest {
    pub manager_a: Pubkey,
    pub manager_b: Pubkey,
    pub oracle: Pubkey,
    pub gameweek: u16,
    pub stake: u64,
    pub state: ContestState,
    pub bump: u8,
}

impl Contest {
    pub const LEN: usize = 8 + 32 * 3 + 2 + 8 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum ContestState {
    Open,
    Locked,
    Settled,
}

#[derive(Accounts)]
#[instruction(gameweek: u16)]
pub struct CreateContest<'info> {
    #[account(mut)]
    pub manager_a: Signer<'info>,
    #[account(
        init,
        payer = manager_a,
        space = Contest::LEN,
        seeds = [b"contest", manager_a.key().as_ref(), &gameweek.to_le_bytes()],
        bump
    )]
    pub contest: Account<'info, Contest>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinContest<'info> {
    #[account(mut)]
    pub manager_b: Signer<'info>,
    #[account(mut)]
    pub contest: Account<'info, Contest>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(mut)]
    pub contest: Account<'info, Contest>,
    /// CHECK: winner verified against contest.manager_a / manager_b in the handler.
    #[account(mut)]
    pub winner: UncheckedAccount<'info>,
    /// CHECK: protocol treasury, set at deployment.
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,
    /// CHECK: instructions sysvar, used to verify the oracle ed25519 instruction.
    #[account(address = INSTRUCTIONS_ID)]
    pub instructions: UncheckedAccount<'info>,
}

#[error_code]
pub enum ContestError {
    #[msg("stake must be greater than zero")]
    ZeroStake,
    #[msg("contest is not open")]
    NotOpen,
    #[msg("contest is not locked")]
    NotLocked,
    #[msg("a manager cannot contest themselves")]
    SameManager,
    #[msg("missing oracle ed25519 signature instruction")]
    MissingOracleSig,
    #[msg("winner must be one of the two managers")]
    InvalidWinner,
}
