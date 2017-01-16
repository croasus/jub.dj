// This is for things that *affect* some set of elements or state in any of the
// other files. User lib/ for code that views commonly depend on.
//
// This file is loaded before the page content.

// For all buttons, do not keep focus on clicks
$('.btn').on('click', function(e) {
  this.blur();
});

const keys = {
  TAB: 9,
  RETURN: 13,
}
