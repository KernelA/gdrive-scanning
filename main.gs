const SAVE_TOKEN_EVERY = 5
const TOTAL_RECORDS_PER_RUN = 30
const USER_SHEET = "users"
const USER_FILE_SHEET = "user_file_perm"
const FILE_SHEET = "files"
const DUMP_FILE = "dump_info.json"
const FILE_ID_COL = "file_id"
const EMAIL_COL = "email"
const USER_ID_COL = "user_id"
const USER_FILE_HAEDER = [USER_ID_COL, FILE_ID_COL, "role"]
const FILE_INFO_HEADER = [FILE_ID_COL, "name", "size", "type", "sharing premission", "access", "link"]
const USER_HEADER = [USER_ID_COL, "name", EMAIL_COL]

const ROOT_FOLDER_ID = "<your folder id>"

function createOrGetSheetFile(directory, sheetName) {
  var files = directory.getFilesByName(sheetName)

  var sheet = null

  while (files.hasNext()) {
    sheet = files.next()
  }

  if (sheet === null) {
    sheet = createSheet(directory, sheetName)
  }
  else {
    sheet = SpreadsheetApp.open(sheet)
  }

  return sheet
}

function insertHeader(sheet, header) {
  sheet.getRange(`R1C1:R1C${header.length}`).setValues([header])
}

function createSheet(directory, sheetName) {
  var sheet = SpreadsheetApp.create(sheetName)
  var oldSheets = sheet.getSheets()
  sheet.insertSheet(USER_SHEET)
  insertHeader(sheet, USER_HEADER)
  sheet.insertSheet(FILE_SHEET)
  insertHeader(sheet, FILE_INFO_HEADER)
  sheet.insertSheet(USER_FILE_SHEET)
  insertHeader(sheet, USER_FILE_HAEDER)
  oldSheets.forEach(sheetList => sheet.deleteSheet(sheetList))
  DriveApp.getFileById(sheet.getId()).moveTo(directory)

  return sheet
}

function saveDumpInfo(dumpFile, stateInfo) {
  dumpFile.setContent(JSON.stringify(stateInfo))
}

function getDumpInfo(dumpFile) {
  var dump = dumpFile.getBlob().getDataAsString()

  if (dump === "") {
    return null
  }
  else {
    return JSON.parse(dump)
  }
}


function* recursiveScan(directory, dumpFile) {
  var currentDirTokenKey = "currentDirToken"
  var currentFileTokenKey = "currentFileToken"
  var currentDirIdKey = "currentDirId"
  var dirIdsKey = "dirIds"

  var stateInfo = getDumpInfo(dumpFile)


  if (stateInfo === null) {
    stateInfo = { [currentDirTokenKey]: null, [currentFileTokenKey]: null, [currentDirIdKey]: null, [dirIdsKey]: [directory.getId()] }
  }

  var totalRecords = 0

  var dirIds = stateInfo[dirIdsKey]

  if(stateInfo[currentDirIdKey] !== null)
  {
    dirIds.push(stateInfo[currentDirIdKey])
  }

  while (dirIds.length > 0) {
    let currentDirId = stateInfo[currentDirIdKey]

    if (currentDirId === null) {
      currentDirId = dirIds.pop()
      stateInfo[currentDirIdKey] = currentDirId
    }

    let continuationDirToken = stateInfo[currentDirTokenKey]

    let dirIterator = null

    let curerntDir = DriveApp.getFolderById(currentDirId)

    yield curerntDir
    totalRecords++

    if (continuationDirToken === null) {
      dirIterator = curerntDir.getFolders()
    }
    else {
      dirIterator = DriveApp.continueFolderIterator(continuationDirToken)
    }

    let isPartialEnd = false

    while (dirIterator.hasNext()) {
      dirIds.push(dirIterator.next().getId())
      totalRecords++

      if (totalRecords % SAVE_TOKEN_EVERY == 0 || totalRecords >= TOTAL_RECORDS_PER_RUN) {
        stateInfo[currentDirTokenKey] = dirIterator.getContinuationToken()
        saveDumpInfo(dumpFile, stateInfo)
      }

      if (totalRecords >= TOTAL_RECORDS_PER_RUN) {
        isPartialEnd = true
        break
      }

    }

    if (isPartialEnd) {
      return
    }

    stateInfo[currentDirTokenKey] = null
    stateInfo[currentDirIdKey] = null
    saveDumpInfo(dumpFile, stateInfo)

    let fileIterator = null

    let continuationFileToken = stateInfo[currentFileTokenKey]

    if (continuationFileToken === null) {
      fileIterator = curerntDir.getFiles()
    }
    else {
      fileIterator = DriveApp.continueFileIterator(continuationFileToken)
    }

    let deleteToken = true

    while (fileIterator.hasNext()) {
      yield fileIterator.next();
      totalRecords++

      if (totalRecords % SAVE_TOKEN_EVERY == 0 || totalRecords >= TOTAL_RECORDS_PER_RUN) {
        stateInfo[currentFileTokenKey] = fileIterator.getContinuationToken()
        saveDumpInfo(dumpFile, stateInfo)

        if (totalRecords >= TOTAL_RECORDS_PER_RUN) {
          deleteToken = false
          break
        }
      }
    }

    if (stateInfo[currentFileTokenKey] !== null && deleteToken) {
      stateInfo[currentFileTokenKey] = null
      saveDumpInfo(dumpFile, stateInfo)
    }
  }

  var deleteToken = true

  if (stateInfo[currentFileTokenKey] !== null) {
    let fileIterator = DriveApp.continueFileIterator(stateInfo[currentFileTokenKey])

    while (fileIterator.hasNext()) {
      yield fileIterator.next();
      totalRecords++

      if (totalRecords % SAVE_TOKEN_EVERY == 0 || totalRecords >= TOTAL_RECORDS_PER_RUN) {
        stateInfo[currentFileTokenKey] = fileIterator.getContinuationToken()
        saveDumpInfo(dumpFile, stateInfo)

        if (totalRecords >= TOTAL_RECORDS_PER_RUN) {
          deleteToken = false
          break
        }
      }
    }
  }

  if (stateInfo[currentFileTokenKey] !== null && deleteToken) {
    stateInfo[currentFileTokenKey] = null
    saveDumpInfo(dumpFile, stateInfo)
  }
}

function createOrGetDumpFile(directory) {
  var fileIter = directory.getFilesByName(DUMP_FILE)

  var file = null

  while (fileIter.hasNext()) {
    file = fileIter.next()
  }

  if (file === null) {
    file = directory.createFile(DUMP_FILE, "")
  }

  return file
}

function getAllFileIds(sheet) {
  var fileSheet = sheet.getSheetByName(FILE_SHEET)
  var colIndex = fileSheet.getRange("R1C1:R1").createTextFinder(FILE_ID_COL).matchEntireCell(true).findNext().getColumn()
  var allIds = new Set()

  fileSheet.getRange(`R2C${colIndex}:C${colIndex}`).getValues().flat().filter(item => item.trim() !== "").forEach(fileId => allIds.add(fileId.trim()))
  return allIds
}

function getEmailIdMapping(sheet) {
  var userSheet = sheet.getSheetByName(USER_SHEET)
  var emailColIndex = userSheet.getRange("R1C1:R1").createTextFinder(EMAIL_COL).matchEntireCell(true).findNext().getColumn()
  var userIdColIndex = userSheet.getRange("R1C1:R1").createTextFinder(USER_ID_COL).matchEntireCell(true).findNext().getColumn()
  var allIds = new Map()

  var emails = userSheet.getRange(`R2C${emailColIndex}:C${emailColIndex}`).getValues().flat()
  var userIds = userSheet.getRange(`R2C${userIdColIndex}:C${userIdColIndex}`).getValues().flat()

  for (let i = 0; i < emails.length; i++) {
    if (emails[i] !== "") {
      allIds.set(emails[i], userIds[i])
    }
  }

  return allIds
}

function main() {
  var rootDir = DriveApp.getRootFolder()

  var infoDir = DriveApp.getFolderById(ROOT_FOLDER_ID)

  var sheet = createOrGetSheetFile(infoDir, "All files")
  var dumpFile = createOrGetDumpFile(infoDir)


  var allIds = getAllFileIds(sheet)
  var email2Id = getEmailIdMapping(sheet)

  var entryIter = recursiveScan(rootDir, dumpFile)

  while (true) {
    var entry = entryIter.next()

    if (entry.done) {
      break
    }

    if (allIds.has(entry.value.getId())) {
      continue
    }

    addUsersInfo(sheet, entry.value, email2Id)
    addFileInfoToSheet(sheet, entry.value)
    allIds.add(entry.value.getId())
  }
}


function insertUsers(sheet, email2Id, newUsers) {
  var userSheet = sheet.getSheetByName(USER_SHEET)
  var freeRow = userSheet.getLastRow() + 1

  // For some users getEmail may return empty string
  var userIds = new Array(newUsers.length).fill(-1)
  var newIndex = freeRow

  var insertUsers = newUsers.filter((user, index) => {
    let email = user.getEmail()

    if (email === "") {
      userIds[index] = newIndex
      newIndex++
    }

    return email === "" || !email2Id.has(email)
  }
  ).map(userInfo => {
    let row = [newIndex, userInfo.getName(), userInfo.getEmail()]
    newIndex++
    return row
  })

  if (insertUsers.length > 0) {
    var lastRow = freeRow + insertUsers.length - 1
    userSheet.getRange(`R${freeRow}C1:R${lastRow}C${USER_HEADER.length}`).setValues(insertUsers)
    insertUsers.forEach(userArray => email2Id.set(userArray[2], userArray[0]))
  }

  userIds = userIds.map((value, index) => {
    if (value == -1) {
      return email2Id.get(newUsers[index].getEmail())
    }
    return value
  })

  return userIds
}

function insertUserFileRole(sheet, userIds, fileId, role) {
  //  ["userd_id", "file_id", "role"]
  var userFileSheet = sheet.getSheetByName(USER_FILE_SHEET)

  var rows = userIds.map(userId => [userId, fileId, role])

  var freeRow = userFileSheet.getLastRow() + 1
  var lastRow = freeRow + rows.length - 1
  userFileSheet.getRange(`R${freeRow}C1:R${lastRow}C${USER_FILE_HAEDER.length}`).setValues(rows)
}

function addUsersInfo(sheet, entry, email2Id) {
  var fileId = entry.getId()

  var allEditors = entry.getEditors()

  if (allEditors.length > 0) {
    let userIds = insertUsers(sheet, email2Id, allEditors)
    insertUserFileRole(sheet, userIds, fileId, "EDITOR")
  }

  var allViewers = entry.getViewers()

  if (allViewers.length > 0) {
    let userIds = insertUsers(sheet, email2Id, allViewers)
    insertUserFileRole(sheet, userIds, fileId, "VIEW_OR_COMMENT")
  }

  let userIds = insertUsers(sheet, email2Id, [entry.getOwner()])
  insertUserFileRole(sheet, userIds, fileId, "OWNER")
}

function addFileInfoToSheet(sheet, entry) {
  var activeSheet = sheet.getSheetByName(FILE_SHEET)

  var freeRow = activeSheet.getLastRow() + 1
  var range = activeSheet.getRange(`R${freeRow}C1:R${freeRow}C${FILE_INFO_HEADER.length}`)

  var mimeType = ""

  if ("getMimeType" in entry) {
    mimeType = entry.getMimeType()
  }

  range.setValues([[entry.getId(), entry.getName(), entry.getSize(), mimeType, entry.getSharingPermission(), entry.getSharingAccess(), entry.getUrl()]])
}