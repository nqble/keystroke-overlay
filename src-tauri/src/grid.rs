//! The "even grid" layout style: every key one key wide, in neat columns, row by row.
//!
//! The Keys tab and the OBS overlay both draw this style, so the positions are worked out here, once, and sent to both
//! as part of every layout (`layout["grid"]`, see `server::layouts`). That way the two can never disagree.

use serde_json::{json, Map, Value};

/// Keys whose tops are within this many key heights of the first key of a row belong to that row. Real layouts put a
/// whole row at the same height, but hand-made layouts may be a little off.
const SAME_ROW_TOLERANCE: f64 = 0.5;

/// Where each key sits in the even grid, as `{ "KeyW": { "x": 2, "y": 1 }, ... }` with the top-left key at (0, 0).
/// Rows keep the order the layout has them in; within a row, keys are numbered left to right.
pub fn even_grid(keys: &[Value]) -> Value {
    let mut placed: Vec<(&str, f64, f64)> = keys
        .iter()
        .filter_map(|key| Some((key["code"].as_str()?, key["x"].as_f64()?, key["y"].as_f64()?)))
        .collect();
    placed.sort_by(|a, b| a.2.total_cmp(&b.2).then(a.1.total_cmp(&b.1)));

    let mut grid = Map::new();
    let mut row = 0;
    let mut column = 0;
    let mut row_top: Option<f64> = None; // the top of the first key of the current row
    for (code, _, top) in placed {
        match row_top {
            Some(first) if top - first <= SAME_ROW_TOLERANCE => column += 1,
            Some(_) => {
                row += 1;
                column = 0;
                row_top = Some(top);
            }
            None => row_top = Some(top),
        }
        grid.insert(code.to_string(), json!({ "x": column, "y": row }));
    }
    Value::Object(grid)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(code: &str, x: f64, y: f64) -> Value {
        json!({ "code": code, "x": x, "y": y })
    }

    #[test]
    fn rows_are_kept_and_keys_are_numbered_left_to_right() {
        let keys = [
            key("KeyS", 1.5, 1.0),
            key("KeyA", 0.5, 1.0),
            key("KeyW", 1.0, 0.0),
            key("Space", 1.0, 2.0),
        ];
        let grid = even_grid(&keys);
        assert_eq!(grid["KeyW"], json!({ "x": 0, "y": 0 }));
        assert_eq!(grid["KeyA"], json!({ "x": 0, "y": 1 }));
        assert_eq!(grid["KeyS"], json!({ "x": 1, "y": 1 }));
        assert_eq!(grid["Space"], json!({ "x": 0, "y": 2 }));
    }

    #[test]
    fn a_gap_between_rows_does_not_leave_an_empty_row() {
        let grid = even_grid(&[key("Esc", 0.0, 0.0), key("Digit1", 0.0, 1.5)]);
        assert_eq!(grid["Digit1"], json!({ "x": 0, "y": 1 }));
    }

    #[test]
    fn keys_a_little_off_the_row_height_still_share_the_row() {
        let grid = even_grid(&[key("KeyA", 0.0, 1.0), key("KeyS", 1.0, 1.3)]);
        assert_eq!(grid["KeyA"]["y"], grid["KeyS"]["y"]);
    }

    #[test]
    fn every_key_gets_a_place_and_no_two_share_one() {
        let keys: Vec<Value> = (0..40)
            .map(|n| key(&format!("Key{n}"), (n * 7 % 13) as f64 * 0.75, (n % 5) as f64 * 1.25))
            .collect();
        let grid = even_grid(&keys);
        let places: std::collections::HashSet<(i64, i64)> = grid
            .as_object()
            .unwrap()
            .values()
            .map(|p| (p["x"].as_i64().unwrap(), p["y"].as_i64().unwrap()))
            .collect();
        assert_eq!(grid.as_object().unwrap().len(), 40);
        assert_eq!(places.len(), 40);
    }

    #[test]
    fn junk_keys_are_skipped_and_an_empty_layout_gives_an_empty_grid() {
        assert_eq!(even_grid(&[]), json!({}));
        assert_eq!(
            even_grid(&[json!({ "code": 5 }), json!("x"), json!({ "code": "A" })]),
            json!({})
        );
    }
}
