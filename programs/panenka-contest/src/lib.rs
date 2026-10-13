//! Panenka Protocol - contest escrow program (DEVNET-ONLY for the hackathon, see docs/COMPLIANCE.md).
//!
//! Two managers escrow an agreed stake into a per-contest PDA vault. When the
//! gameweek closes, the oracle service computes the outcome from official FPL
//! points and signs it (ed25519). The program verifies the oracle signature
//! and settles: winner receives the pot minus the protocol fee (500 bps = 5%),
//! which goes to the protocol treasury.
//!
//! Settlement is skill-based: inputs are official fantasy-sports points only.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::ed25519_program;
use anchor_lang::solana_program::pubkey;
use anchor_lang::solana_program::sysvar::instructions::{load_current_index_checked, load_instruction_at_checked, ID as INSTRUCTIONS_ID};

declare_id!("Bv3J2KL8Kp2twqF86d8j77DKUX5NTF4ns4kFftenPU85");

pub const PROTOCOL_FEE_BPS: u64 = 500; // 5%
// Fixed devnet demonstration treasury. A future value-bearing deployment
// would require a counsel-reviewed redesign and a governed multisig.
pub const DEVNET_TREASURY: Pubkey = pubkey!("8wTiPnMnZUwUxSSy8GZUABUPfLMnTkoSVhAg2htXcB6c");
pub const ED25519_SIGNATURE_LEN: usize = 64;
pub const PUBKEY_LEN: usize = 32;

#[program]
pub mod panenka_contest {
    use super::*;

    /// Manager A creates a contest: stakes `stake_lamports` for gameweek `gameweek`,
    /// naming the `oracle` whose signature alone can settle it.
    pub fn create_contest(
        ctx: Context<CreateContest>,
        gameweek: u16,
        stake_lamports: u64,
        oracle: Pubkey,
        entry_id: u32,
        binding_expiry: i64,
    ) -> Result<()> {
        verify_binding(&ctx.accounts.instructions.to_account_info(), &oracle, &ctx.accounts.manager_a.key(), entry_id, binding_expiry)?;
        require!(stake_lamports > 0, ContestError::ZeroStake);
        require!(oracle != Pubkey::default(), ContestError::InvalidOracle);
        let contest = &mut ctx.accounts.contest;
        contest.manager_a = ctx.accounts.manager_a.key();
        contest.entry_a = entry_id;
        contest.manager_b = Pubkey::default();
        contest.oracle = oracle;
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
    pub fn join_contest(ctx: Context<JoinContest>, entry_id: u32, binding_expiry: i64) -> Result<()> {
        verify_binding(&ctx.accounts.instructions.to_account_info(), &ctx.accounts.contest.oracle, &ctx.accounts.manager_b.key(), entry_id, binding_expiry)?;
        let contest = &mut ctx.accounts.contest;
        require!(contest.state == ContestState::Open, ContestError::NotOpen);
        require!(ctx.accounts.manager_b.key() != contest.manager_a, ContestError::SameManager);

        require!(entry_id != ctx.accounts.contest.entry_a, ContestError::SameManager);
        let contest = &mut ctx.accounts.contest;
        contest.manager_b = ctx.accounts.manager_b.key();
        contest.entry_b = entry_id;
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

    /// Manager A cancels an un-joined contest and reclaims the stake. The
    /// account closes; rent lamports return to manager A.
    pub fn cancel_contest(ctx: Context<CancelContest>) -> Result<()> {
        let contest = &ctx.accounts.contest;
        require!(contest.state == ContestState::Open, ContestError::NotOpen);

        let refund = contest.stake;
        **ctx.accounts.contest.to_account_info().try_borrow_mut_lamports()? -= refund;
        **ctx.accounts.manager_a.to_account_info().try_borrow_mut_lamports()? += refund;
        // Anchor's `close` on the context returns the remaining rent lamports.
        Ok(())
    }

    /// Settle after the gameweek closes. The transaction must begin with an
    /// ed25519 verification instruction from the contest's oracle over
    /// `oracle_message(..)`, which commits to contest, both managers and FPL
    /// entry ids, gameweek, both point totals and a data hash. The winner is
    /// derived here from the signed points, not chosen by the caller. An exact
    /// tie refunds both stakes with no fee.
    pub fn settle(ctx: Context<Settle>, points_a: i16, points_b: i16, data_hash: [u8; 32]) -> Result<()> {
        let contest_key = ctx.accounts.contest.key();
        let contest = &mut ctx.accounts.contest;
        require!(contest.state == ContestState::Locked, ContestError::NotLocked);

        let ixs = ctx.accounts.instructions.to_account_info();
        let ix = load_instruction_at_checked(0, &ixs)?;
        require!(ix.program_id == ed25519_program::ID, ContestError::MissingOracleSig);
        verify_ed25519_signer(&ix.data, &contest.oracle)?;
        let expected = oracle_message(contest, &contest_key, points_a, points_b, &data_hash);
        require!(message_matches(&ix.data, &expected), ContestError::OracleMessageMismatch);

        let pot = contest.stake.checked_mul(2).ok_or(ContestError::Overflow)?;
        if points_a == points_b {
            **contest.to_account_info().try_borrow_mut_lamports()? -= contest.stake;
            **ctx.accounts.manager_a.to_account_info().try_borrow_mut_lamports()? += contest.stake;
            **contest.to_account_info().try_borrow_mut_lamports()? -= contest.stake;
            **ctx.accounts.manager_b.to_account_info().try_borrow_mut_lamports()? += contest.stake;
        } else {
            let winner = if points_a > points_b { &ctx.accounts.manager_a } else { &ctx.accounts.manager_b };
            let fee = pot.checked_mul(PROTOCOL_FEE_BPS).ok_or(ContestError::Overflow)? / 10_000;
            let payout = pot.checked_sub(fee).ok_or(ContestError::Overflow)?;
            **contest.to_account_info().try_borrow_mut_lamports()? -= payout;
            **winner.to_account_info().try_borrow_mut_lamports()? += payout;
            **contest.to_account_info().try_borrow_mut_lamports()? -= fee;
            **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += fee;
        }
        contest.state = ContestState::Settled;
        Ok(())
    }
}

/// Canonical oracle message v2 (all integers little-endian):
/// "PNK2" || contest || manager_a || manager_b || entry_a u32 || entry_b u32 ||
/// gameweek u16 || points_a i16 || points_b i16 || data_hash[32].
/// Must match oracleMessage() in oracle/src/client.ts.
pub fn oracle_message(c: &Contest, contest_key: &Pubkey, points_a: i16, points_b: i16, data_hash: &[u8; 32]) -> Vec<u8> {
    let mut m = Vec::with_capacity(4 + 32 * 3 + 4 * 2 + 2 * 3 + 32);
    m.extend_from_slice(b"PNK2");
    m.extend_from_slice(contest_key.as_ref());
    m.extend_from_slice(c.manager_a.as_ref());
    m.extend_from_slice(c.manager_b.as_ref());
    m.extend_from_slice(&c.entry_a.to_le_bytes());
    m.extend_from_slice(&c.entry_b.to_le_bytes());
    m.extend_from_slice(&c.gameweek.to_le_bytes());
    m.extend_from_slice(&points_a.to_le_bytes());
    m.extend_from_slice(&points_b.to_le_bytes());
    m.extend_from_slice(data_hash);
    m
}

/// Ownership binding: the instruction immediately before this one must be an
/// ed25519 verification by `oracle` over "PNKB" || wallet || entry_id u32 || expiry i64,
/// and the binding must not be expired. The oracle only signs after checking
/// off-chain that the wallet's owner controls the FPL entry (challenge code).
fn verify_binding(ixs: &AccountInfo, oracle: &Pubkey, wallet: &Pubkey, entry_id: u32, expiry: i64) -> Result<()> {
    let idx = load_current_index_checked(ixs)? as usize;
    require!(idx > 0, ContestError::MissingBinding);
    let ix = load_instruction_at_checked(idx - 1, ixs)?;
    require!(ix.program_id == ed25519_program::ID, ContestError::MissingBinding);
    verify_ed25519_signer(&ix.data, oracle)?;
    let mut expected = Vec::with_capacity(4 + 32 + 4 + 8);
    expected.extend_from_slice(b"PNKB");
    expected.extend_from_slice(wallet.as_ref());
    expected.extend_from_slice(&entry_id.to_le_bytes());
    expected.extend_from_slice(&expiry.to_le_bytes());
    require!(message_matches(&ix.data, &expected), ContestError::BindingMismatch);
    require!(Clock::get()?.unix_timestamp <= expiry, ContestError::BindingExpired);
    Ok(())
}

/// Verify the ed25519 instruction: exactly one signature, self-contained
/// (offsets reference this instruction's own data), signed by contest.oracle.
fn verify_ed25519_signer(data: &[u8], oracle: &Pubkey) -> Result<()> {
    require!(data.len() >= 16, ContestError::MalformedOracleSig);
    let num_signatures = data[0];
    require!(num_signatures == 1, ContestError::MalformedOracleSig);

    // Signature descriptor starts at byte 2 (14 bytes, all u16 LE).
    let sig_ix_index = u16::from_le_bytes([data[4], data[5]]);
    let pubkey_offset = u16::from_le_bytes([data[6], data[7]]) as usize;
    let pubkey_ix_index = u16::from_le_bytes([data[8], data[9]]);
    let msg_ix_index = u16::from_le_bytes([data[14], data[15]]);

    // All referenced data must live inside this instruction (u16::MAX sentinel).
    require!(
        sig_ix_index == u16::MAX && pubkey_ix_index == u16::MAX && msg_ix_index == u16::MAX,
        ContestError::MalformedOracleSig
    );
    require!(
        pubkey_offset + PUBKEY_LEN <= data.len(),
        ContestError::MalformedOracleSig
    );
    let signer = &data[pubkey_offset..pubkey_offset + PUBKEY_LEN];
    require!(signer == oracle.as_ref(), ContestError::WrongOracle);
    Ok(())
}

/// Check the signed message in the ed25519 instruction equals `expected`.
fn message_matches(data: &[u8], expected: &[u8]) -> bool {
    if data.len() < 16 {
        return false;
    }
    let msg_offset = u16::from_le_bytes([data[10], data[11]]) as usize;
    let msg_len = u16::from_le_bytes([data[12], data[13]]) as usize;
    if msg_offset + msg_len > data.len() {
        return false;
    }
    &data[msg_offset..msg_offset + msg_len] == expected
}

#[account]
pub struct Contest {
    pub manager_a: Pubkey,
    pub manager_b: Pubkey,
    pub oracle: Pubkey,
    pub entry_a: u32,
    pub entry_b: u32,
    pub gameweek: u16,
    pub stake: u64,
    pub state: ContestState,
    pub bump: u8,
}

impl Contest {
    pub const LEN: usize = 8 + 32 * 3 + 4 + 4 + 2 + 8 + 1 + 1;
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
    /// CHECK: instructions sysvar, used to verify the oracle ownership binding.
    #[account(address = INSTRUCTIONS_ID)]
    pub instructions: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct JoinContest<'info> {
    #[account(mut)]
    pub manager_b: Signer<'info>,
    #[account(mut, seeds = [b"contest", contest.manager_a.as_ref(), &contest.gameweek.to_le_bytes()], bump = contest.bump)]
    pub contest: Account<'info, Contest>,
    pub system_program: Program<'info, System>,
    /// CHECK: instructions sysvar, used to verify the oracle ownership binding.
    #[account(address = INSTRUCTIONS_ID)]
    pub instructions: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CancelContest<'info> {
    #[account(mut, address = contest.manager_a)]
    pub manager_a: Signer<'info>,
    #[account(
        mut,
        seeds = [b"contest", contest.manager_a.as_ref(), &contest.gameweek.to_le_bytes()],
        bump = contest.bump,
        close = manager_a
    )]
    pub contest: Account<'info, Contest>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(
        mut,
        seeds = [b"contest", contest.manager_a.as_ref(), &contest.gameweek.to_le_bytes()],
        bump = contest.bump,
        close = manager_a
    )]
    pub contest: Account<'info, Contest>,
    /// CHECK: second manager, address-checked against the contest.
    #[account(mut, address = contest.manager_b)]
    pub manager_b: UncheckedAccount<'info>,
    /// CHECK: fee recipient fixed to the devnet protocol treasury.
    #[account(mut, address = DEVNET_TREASURY @ ContestError::WrongTreasury)]
    pub treasury: UncheckedAccount<'info>,
    /// CHECK: original manager gets the account rent on close.
    #[account(mut, address = contest.manager_a)]
    pub manager_a: UncheckedAccount<'info>,
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
    #[msg("malformed oracle ed25519 instruction")]
    MalformedOracleSig,
    #[msg("ed25519 signer is not the contest oracle")]
    WrongOracle,
    #[msg("oracle message does not match contest, winner and gameweek")]
    OracleMessageMismatch,
    #[msg("winner must be one of the two managers")]
    InvalidWinner,
    #[msg("missing oracle ownership-binding instruction")]
    MissingBinding,
    #[msg("binding does not match wallet, entry id and expiry")]
    BindingMismatch,
    #[msg("ownership binding expired")]
    BindingExpired,
    #[msg("arithmetic overflow")]
    Overflow,
    #[msg("oracle pubkey must be set")]
    InvalidOracle,
    #[msg("treasury does not match the fixed devnet protocol treasury")]
    WrongTreasury,
}
