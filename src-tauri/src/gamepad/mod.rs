//! Game controllers (docs/design/future-inputs.md, the plan in docs/for-claude/proposals/controllers-gilrs.md).
//!
//! For now only the name table (`names.rs`) is here. It is built in every build so its tests always run.

// Nothing outside this folder uses the table yet, so it would count as unused code in a normal build.
#[allow(dead_code)]
mod names;
