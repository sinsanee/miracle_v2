const fs = require('fs');

/**
 * Deletes an array of files asynchronously.
 * 
 * @param {string[]} files - An array of file paths to delete.
 */
function deleteFiles(files) {
  let i = files.length;

  if (i === 0) {
    console.error('No files to delete!'); // Nothing to delete
    return;
  }

  files.forEach(function(filepath) {
    fs.unlink(filepath, function(err) {
      i--;
      if (err) {
        console.error("There was an error:", err)
        return;
      } else if (i <= 0) {
        console.log('files deleted')
      }
    });
  });
}

module.exports = deleteFiles;