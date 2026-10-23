Attribute VB_Name = "IconExporter"
Option Explicit

Private Enum IconExportResult
        IconExportSucceeded = 1
        IconExportUnavailable = 2
        IconExportFailed = 3
        IconExportUpdated = 4
        IconExportUnchanged = 5
        IconExportStatusChanged = 6
        IconExportPlaceholderCreated = 7
End Enum

Private Type GdiplusStartupInput
        GdiplusVersion As Long
        DebugEventCallback As LongPtr
        SuppressBackgroundThread As Long
        SuppressExternalCodecs As Long
End Type

Private Type Guid
        Data1 As Long
        Data2 As Integer
        Data3 As Integer
        Data4(0 To 7) As Byte
End Type

Private Declare PtrSafe Function GdiplusStartup Lib "gdiplus" (ByRef token As LongPtr, ByRef startupInput As GdiplusStartupInput, ByVal startupOutput As LongPtr) As Long
Private Declare PtrSafe Sub GdiplusShutdown Lib "gdiplus" (ByVal token As LongPtr)
Private Declare PtrSafe Function GdipCreateBitmapFromHBITMAP Lib "gdiplus" (ByVal hBitmap As LongPtr, ByVal hPalette As LongPtr, ByRef bitmap As LongPtr) As Long
Private Declare PtrSafe Function GdipCreateBitmapFromScan0 Lib "gdiplus" (ByVal width As Long, ByVal height As Long, ByVal stride As Long, ByVal pixelFormat As Long, ByVal scan0 As LongPtr, ByRef bitmap As LongPtr) As Long
Private Declare PtrSafe Function GdipSaveImageToFile Lib "gdiplus" (ByVal image As LongPtr, ByVal fileName As LongPtr, ByRef encoderClsid As Guid, ByVal encoderParams As LongPtr) As Long
Private Declare PtrSafe Function GdipDisposeImage Lib "gdiplus" (ByVal image As LongPtr) As Long
Private Declare PtrSafe Function GetObjectBitmap Lib "gdi32" Alias "GetObjectW" (ByVal hObject As LongPtr, ByVal byteCount As Long, ByRef bitmapInfo As Any) As Long
Private Declare PtrSafe Sub CopyMemory Lib "kernel32" Alias "RtlMoveMemory" (ByVal destination As LongPtr, ByVal source As LongPtr, ByVal byteCount As LongPtr)
Private Declare PtrSafe Function MoveFileExW Lib "kernel32" (ByVal existingFileName As LongPtr, ByVal newFileName As LongPtr, ByVal flags As Long) As Long
Private Declare PtrSafe Function BCryptOpenAlgorithmProvider Lib "bcrypt.dll" (ByRef algorithmHandle As LongPtr, ByVal algorithmId As LongPtr, ByVal implementation As LongPtr, ByVal flags As Long) As Long
Private Declare PtrSafe Function BCryptGetProperty Lib "bcrypt.dll" (ByVal objectHandle As LongPtr, ByVal propertyName As LongPtr, ByRef outputBuffer As Any, ByVal outputBufferSize As Long, ByRef resultSize As Long, ByVal flags As Long) As Long
Private Declare PtrSafe Function BCryptCreateHash Lib "bcrypt.dll" (ByVal algorithmHandle As LongPtr, ByRef hashHandle As LongPtr, ByRef hashObject As Any, ByVal hashObjectSize As Long, ByVal secret As LongPtr, ByVal secretSize As Long, ByVal flags As Long) As Long
Private Declare PtrSafe Function BCryptHashData Lib "bcrypt.dll" (ByVal hashHandle As LongPtr, ByRef inputBuffer As Any, ByVal inputBufferSize As Long, ByVal flags As Long) As Long
Private Declare PtrSafe Function BCryptFinishHash Lib "bcrypt.dll" (ByVal hashHandle As LongPtr, ByRef outputBuffer As Any, ByVal outputBufferSize As Long, ByVal flags As Long) As Long
Private Declare PtrSafe Function BCryptDestroyHash Lib "bcrypt.dll" (ByVal hashHandle As LongPtr) As Long
Private Declare PtrSafe Function BCryptCloseAlgorithmProvider Lib "bcrypt.dll" (ByVal algorithmHandle As LongPtr, ByVal flags As Long) As Long

Public Sub ExportMissingIcons()
        ExportIcons False, 1, 0
End Sub

Public Function RunExportMissingIcons() As String
        RunExportMissingIcons = ExportIcons(False, 1, 0)
End Function

Public Function RunExportMissingIconsVerbose() As String
        RunExportMissingIconsVerbose = ExportIcons(True, 1, 0)
End Function

Public Function RunExportIconsBatch(ByVal startIndex As Long, ByVal maxItems As Long) As String
        RunExportIconsBatch = ExportIcons(True, startIndex, maxItems)
End Function

Private Function ExportIcons(ByVal verboseMode As Boolean, ByVal startIndex As Long, ByVal maxItems As Long) As String
        Const listFileName As String = "idMso-List.txt"

        Dim fileSystem As Object
        Dim inputFile As Object
        Dim placeholderHashes As Object
        Dim statusSheet As Worksheet
        Dim unavailableIds As Collection
        Dim runLog As Collection
        Dim startupInput As GdiplusStartupInput
        Dim pngEncoder As Guid
        Dim projectFolder As String
        Dim toolsFolder As String
        Dim repositoryRoot As String
        Dim listPath As String
        Dim placeholderManifestPath As String
        Dim outputFolder As String
        Dim idMso As String
        Dim outputPath As String
        Dim temporaryPath As String
        Dim resultDetails As String
        Dim resultStatus As String
        Dim exportResult As IconExportResult
        Dim exportedCount As Long
        Dim updatedCount As Long
        Dim skippedCount As Long
        Dim statusChangedCount As Long
        Dim errorCount As Long
        Dim listIndex As Long
        Dim processedCount As Long
        Dim gdiplusToken As LongPtr
        Dim startupStatus As Long
        Dim failureMessage As String

        On Error GoTo Failed

        Set fileSystem = CreateObject("Scripting.FileSystemObject")
        Set unavailableIds = New Collection
        Set runLog = New Collection
        Set statusSheet = ThisWorkbook.Worksheets(1)

        projectFolder = fileSystem.GetParentFolderName(ThisWorkbook.Path)
        toolsFolder = fileSystem.GetParentFolderName(projectFolder)
        repositoryRoot = fileSystem.GetParentFolderName(toolsFolder)
        listPath = fileSystem.BuildPath(projectFolder, listFileName)
        outputFolder = fileSystem.BuildPath(repositoryRoot, "images")

        If Not fileSystem.FileExists(listPath) Then
                Err.Raise vbObjectError + 1000, "ExportMissingIcons", "Cannot find " & listPath
        End If

        If Not fileSystem.FolderExists(outputFolder) Then
                Err.Raise vbObjectError + 1001, "ExportMissingIcons", "Cannot find output folder " & outputFolder
        End If
        placeholderManifestPath = fileSystem.BuildPath(repositoryRoot, "assets\placeholders\manifest.tsv")
        Set placeholderHashes = LoadPlaceholderHashes(fileSystem, placeholderManifestPath)
        If startIndex < 1 Then Err.Raise vbObjectError + 1003, "ExportIcons", "The start index must be at least 1."
        If maxItems < 0 Then Err.Raise vbObjectError + 1004, "ExportIcons", "The item limit cannot be negative."

        startupInput.GdiplusVersion = 1
        startupStatus = GdiplusStartup(gdiplusToken, startupInput, 0)
        If startupStatus <> 0 Then
                Err.Raise vbObjectError + 1002, "ExportMissingIcons", "GDI+ could not be started. Status: " & startupStatus
        End If

        Set inputFile = fileSystem.OpenTextFile(listPath, 1, False, -2)
        Do While Not inputFile.AtEndOfStream
                If maxItems > 0 And processedCount >= maxItems Then Exit Do
                idMso = Trim$(inputFile.ReadLine)
                If Len(idMso) > 0 Then
                        listIndex = listIndex + 1
                        If listIndex >= startIndex Then
                                processedCount = processedCount + 1
                                outputPath = fileSystem.BuildPath(outputFolder, idMso & ".png")
                                temporaryPath = fileSystem.BuildPath(outputFolder, idMso & ".extracting.png")
                                resultDetails = vbNullString
                                exportResult = ProcessImageMso(fileSystem, placeholderHashes, idMso, outputPath, temporaryPath, pngEncoder, resultDetails)
                                Select Case exportResult
                                        Case IconExportSucceeded
                                                exportedCount = exportedCount + 1
                                                resultStatus = "Exported"
                                        Case IconExportPlaceholderCreated
                                                exportedCount = exportedCount + 1
                                                resultStatus = "Exported placeholder"
                                        Case IconExportUpdated
                                                updatedCount = updatedCount + 1
                                                resultStatus = "Updated"
                                        Case IconExportStatusChanged
                                                updatedCount = updatedCount + 1
                                                statusChangedCount = statusChangedCount + 1
                                                resultStatus = "STATUS CHANGED"
                                        Case IconExportUnchanged
                                                skippedCount = skippedCount + 1
                                                resultStatus = "Unchanged"
                                        Case IconExportUnavailable
                                                unavailableIds.Add idMso
                                                resultStatus = "Unavailable"
                                        Case Else
                                                errorCount = errorCount + 1
                                                resultStatus = "Error"
                                End Select

                                If verboseMode Or exportResult = IconExportStatusChanged Or exportResult = IconExportPlaceholderCreated Then
                                        runLog.Add Array(idMso, resultStatus, resultDetails)
                                End If
                        End If
                End If
        Loop

        GoTo Finished

Failed:
        failureMessage = "VBA error " & Err.Number & ": " & Err.Description
        Err.Clear

Finished:
        On Error Resume Next
        If Not inputFile Is Nothing Then inputFile.Close
        If gdiplusToken <> 0 Then GdiplusShutdown gdiplusToken
        WriteRunSummary statusSheet, listPath, outputFolder, exportedCount, updatedCount, skippedCount, statusChangedCount, unavailableIds, errorCount, failureMessage, verboseMode, runLog, startIndex, maxItems, processedCount
        ThisWorkbook.Save
        On Error GoTo 0
        If Len(failureMessage) > 0 Then
                ExportIcons = "Export failed: " & failureMessage
        Else
                ExportIcons = "Export complete. Exported " & CStr(exportedCount) & _
                        ", updated " & CStr(updatedCount) & _
                        ", unchanged " & CStr(skippedCount) & _
                        ", status changes " & CStr(statusChangedCount) & _
                        ", unavailable " & CStr(unavailableIds.Count) & _
                        ", errors " & CStr(errorCount)
        End If
End Function

Private Function LoadPlaceholderHashes(ByVal fileSystem As Object, ByVal manifestPath As String) As Object
        Dim placeholderHashes As Object
        Dim manifestFile As Object
        Dim manifestRow As String
        Dim fields As Variant
        Dim failureNumber As Long
        Dim failureDescription As String

        On Error GoTo Failed
        If Not fileSystem.FileExists(manifestPath) Then Err.Raise vbObjectError + 1110, "LoadPlaceholderHashes", "Cannot find placeholder manifest " & manifestPath

        Set placeholderHashes = CreateObject("Scripting.Dictionary")
        placeholderHashes.CompareMode = vbTextCompare
        Set manifestFile = fileSystem.OpenTextFile(manifestPath, 1, False, -2)
        Do While Not manifestFile.AtEndOfStream
                manifestRow = Trim$(manifestFile.ReadLine)
                If Len(manifestRow) > 0 Then
                        fields = Split(manifestRow, vbTab)
                        If UBound(fields) <> 3 Then Err.Raise vbObjectError + 1111, "LoadPlaceholderHashes", "Invalid placeholder manifest row: " & manifestRow
                        If Len(fields(0)) <> 64 Or LCase$(fields(1)) <> "placeholder" Then Err.Raise vbObjectError + 1112, "LoadPlaceholderHashes", "Invalid placeholder hash or status: " & manifestRow
                        If placeholderHashes.Exists(fields(0)) Then Err.Raise vbObjectError + 1113, "LoadPlaceholderHashes", "Duplicate placeholder hash: " & fields(0)
                        placeholderHashes.Add fields(0), fields(2)
                End If
        Loop
        manifestFile.Close
        Set manifestFile = Nothing
        Set LoadPlaceholderHashes = placeholderHashes
        Exit Function

Failed:
        failureNumber = Err.Number
        failureDescription = Err.Description
        On Error Resume Next
        If Not manifestFile Is Nothing Then manifestFile.Close
        On Error GoTo 0
        Err.Raise failureNumber, "LoadPlaceholderHashes", failureDescription
End Function

Private Function ProcessImageMso(ByVal fileSystem As Object, ByVal placeholderHashes As Object, ByVal idMso As String, ByVal outputPath As String, ByVal temporaryPath As String, ByRef pngEncoder As Guid, ByRef resultDetails As String) As IconExportResult
        Dim saveResult As IconExportResult
        Dim existingHash As String
        Dim generatedHash As String
        Dim hashFailure As String
        Dim currentStep As String
        Dim existingStatus As String
        Dim generatedStatus As String

        On Error GoTo Failed

        If fileSystem.FileExists(temporaryPath) Then fileSystem.DeleteFile temporaryPath, True
        currentStep = "Generate temporary PNG"
        saveResult = SaveImageMsoAsPng(idMso, temporaryPath, pngEncoder, resultDetails)
        If saveResult <> IconExportSucceeded Then
                ProcessImageMso = saveResult
                GoTo Cleanup
        End If

        currentStep = "Calculate generated SHA-256"
        generatedHash = Sha256File(temporaryPath, hashFailure)
        If Len(generatedHash) = 0 Then
                resultDetails = hashFailure
                ProcessImageMso = IconExportFailed
                GoTo Cleanup
        End If
        generatedStatus = "real image"
        If placeholderHashes.Exists(generatedHash) Then generatedStatus = "placeholder"

        If fileSystem.FileExists(outputPath) Then
                currentStep = "Calculate existing SHA-256"
                existingHash = Sha256File(outputPath, hashFailure)
                If Len(existingHash) = 0 Then
                        resultDetails = hashFailure
                        ProcessImageMso = IconExportFailed
                        GoTo Cleanup
                End If
                existingStatus = "real image"
                If placeholderHashes.Exists(existingHash) Then existingStatus = "placeholder"
                If StrComp(existingHash, generatedHash, vbBinaryCompare) = 0 Then
                        resultDetails = "SHA-256 unchanged; status remains " & generatedStatus & ": " & generatedHash
                        ProcessImageMso = IconExportUnchanged
                        GoTo Cleanup
                End If
        End If

        currentStep = "Replace output PNG"
        If MoveFileExW(StrPtr(temporaryPath), StrPtr(outputPath), &H9) = 0 Then
                resultDetails = currentStep & " failed (Windows error " & CStr(Err.LastDllError) & ")."
                ProcessImageMso = IconExportFailed
                GoTo Cleanup
        End If

        If Len(existingHash) > 0 Then
                If StrComp(existingStatus, generatedStatus, vbTextCompare) <> 0 Then
                        resultDetails = "IMAGE STATUS CHANGED: " & existingStatus & " -> " & generatedStatus & "; SHA-256 " & existingHash & " -> " & generatedHash
                        ProcessImageMso = IconExportStatusChanged
                Else
                        resultDetails = "SHA-256 changed; status remains " & generatedStatus & ": " & existingHash & " -> " & generatedHash
                        ProcessImageMso = IconExportUpdated
                End If
        Else
                resultDetails = "SHA-256: " & generatedHash & "; status: " & generatedStatus
                If generatedStatus = "placeholder" Then
                        ProcessImageMso = IconExportPlaceholderCreated
                Else
                        ProcessImageMso = IconExportSucceeded
                End If
        End If
        GoTo Cleanup

Failed:
        resultDetails = currentStep & " failed (VBA error " & CStr(Err.Number) & "): " & Err.Description
        Err.Clear
        ProcessImageMso = IconExportFailed

Cleanup:
        On Error Resume Next
        If fileSystem.FileExists(temporaryPath) Then fileSystem.DeleteFile temporaryPath, True
        On Error GoTo 0
End Function

Private Function Sha256File(ByVal filePath As String, ByRef failureDetails As String) As String
        Dim algorithmHandle As LongPtr
        Dim hashHandle As LongPtr
        Dim hashObject() As Byte
        Dim fileBytes() As Byte
        Dim hashBytes() As Byte
        Dim algorithmName As String
        Dim propertyName As String
        Dim objectLength As Long
        Dim hashLength As Long
        Dim resultLength As Long
        Dim fileSize As Long
        Dim fileNumber As Integer
        Dim fileIsOpen As Boolean
        Dim status As Long
        Dim index As Long
        Dim hashText As String

        On Error GoTo Failed

        algorithmName = "SHA256"
        status = BCryptOpenAlgorithmProvider(algorithmHandle, StrPtr(algorithmName), 0, 0)
        If status <> 0 Then Err.Raise vbObjectError + 1100, "Sha256File", "BCryptOpenAlgorithmProvider returned " & Hex$(status)

        propertyName = "ObjectLength"
        status = BCryptGetProperty(algorithmHandle, StrPtr(propertyName), objectLength, LenB(objectLength), resultLength, 0)
        If status <> 0 Then Err.Raise vbObjectError + 1101, "Sha256File", "Could not read SHA-256 object size: " & Hex$(status)

        propertyName = "HashDigestLength"
        status = BCryptGetProperty(algorithmHandle, StrPtr(propertyName), hashLength, LenB(hashLength), resultLength, 0)
        If status <> 0 Then Err.Raise vbObjectError + 1102, "Sha256File", "Could not read SHA-256 digest size: " & Hex$(status)
        If hashLength <> 32 Then Err.Raise vbObjectError + 1103, "Sha256File", "SHA-256 returned an unexpected digest size."

        fileNumber = FreeFile
        Open filePath For Binary Access Read As #fileNumber
        fileIsOpen = True
        fileSize = LOF(fileNumber)
        If fileSize < 1 Then Err.Raise vbObjectError + 1104, "Sha256File", "Cannot hash an empty file."
        ReDim fileBytes(0 To fileSize - 1)
        Get #fileNumber, , fileBytes
        Close #fileNumber
        fileIsOpen = False

        ReDim hashObject(0 To objectLength - 1)
        status = BCryptCreateHash(algorithmHandle, hashHandle, hashObject(0), objectLength, 0, 0, 0)
        If status <> 0 Then Err.Raise vbObjectError + 1105, "Sha256File", "BCryptCreateHash returned " & Hex$(status)
        status = BCryptHashData(hashHandle, fileBytes(0), fileSize, 0)
        If status <> 0 Then Err.Raise vbObjectError + 1106, "Sha256File", "BCryptHashData returned " & Hex$(status)
        ReDim hashBytes(0 To hashLength - 1)
        status = BCryptFinishHash(hashHandle, hashBytes(0), hashLength, 0)
        If status <> 0 Then Err.Raise vbObjectError + 1107, "Sha256File", "BCryptFinishHash returned " & Hex$(status)

        For index = 0 To hashLength - 1
                hashText = hashText & Right$("0" & Hex$(hashBytes(index)), 2)
        Next index
        Sha256File = hashText
        GoTo Cleanup

Failed:
        failureDetails = "SHA-256 failed (VBA error " & CStr(Err.Number) & "): " & Err.Description
        Err.Clear

Cleanup:
        On Error Resume Next
        If fileIsOpen Then Close #fileNumber
        If hashHandle <> 0 Then BCryptDestroyHash hashHandle
        If algorithmHandle <> 0 Then BCryptCloseAlgorithmProvider algorithmHandle, 0
        On Error GoTo 0
End Function

Private Function SaveImageMsoAsPng(ByVal idMso As String, ByVal outputPath As String, ByRef pngEncoder As Guid, ByRef failureDetails As String) As IconExportResult
        Dim picture As Object
        Dim bitmap As LongPtr
        Dim bitmapInfo(0 To 63) As Byte
        Dim pixelBytes() As Byte
        Dim bitmapInfoAddress As LongPtr
        Dim bitsAddress As LongPtr
        Dim bitmapWidth As Long
        Dim bitmapHeight As Long
        Dim stride As Long
        Dim bitsPerPixel As Integer
        Dim pixelByteCount As Long
        Dim pixelIndex As Long
        Dim hasAlpha As Boolean
        Dim currentStep As String
        Dim apiStatus As Long

        On Error GoTo Failed

        currentStep = "GetImageMso"
        Set picture = Application.CommandBars.GetImageMso(idMso, 32, 32)
        If picture Is Nothing Then
                failureDetails = "Office returned no image for this idMso."
                SaveImageMsoAsPng = IconExportUnavailable
                GoTo Cleanup
        End If

        currentStep = "GetObjectBitmap"
        If GetObjectBitmap(picture.Handle, UBound(bitmapInfo) + 1, bitmapInfo(0)) = 0 Then
                failureDetails = currentStep & " returned 0."
                SaveImageMsoAsPng = IconExportFailed
                GoTo Cleanup
        End If

        bitmapInfoAddress = VarPtr(bitmapInfo(0))
        CopyMemory VarPtr(bitmapWidth), bitmapInfoAddress + 4, 4
        CopyMemory VarPtr(bitmapHeight), bitmapInfoAddress + 8, 4
        CopyMemory VarPtr(stride), bitmapInfoAddress + 12, 4
        CopyMemory VarPtr(bitsPerPixel), bitmapInfoAddress + 18, 2
#If Win64 Then
        CopyMemory VarPtr(bitsAddress), bitmapInfoAddress + 24, 8
#Else
        CopyMemory VarPtr(bitsAddress), bitmapInfoAddress + 20, 4
#End If

        currentStep = "Read icon bitmap"
        If bitsPerPixel = 32 And bitsAddress <> 0 Then
                bitmapHeight = Abs(bitmapHeight)
                pixelByteCount = stride * bitmapHeight
                ReDim pixelBytes(0 To pixelByteCount - 1)
                CopyMemory VarPtr(pixelBytes(0)), bitsAddress, pixelByteCount

                For pixelIndex = 3 To pixelByteCount - 1 Step 4
                        If pixelBytes(pixelIndex) <> 0 Then
                                hasAlpha = True
                                Exit For
                        End If
                Next pixelIndex
                If Not hasAlpha Then
                        For pixelIndex = 3 To pixelByteCount - 1 Step 4
                                pixelBytes(pixelIndex) = 255
                        Next pixelIndex
                End If

                currentStep = "GdipCreateBitmapFromScan0"
                apiStatus = GdipCreateBitmapFromScan0(bitmapWidth, bitmapHeight, stride, &H26200A, VarPtr(pixelBytes(0)), bitmap)
        Else
                currentStep = "GdipCreateBitmapFromHBITMAP"
                apiStatus = GdipCreateBitmapFromHBITMAP(picture.Handle, 0, bitmap)
        End If
        If apiStatus <> 0 Then
                failureDetails = currentStep & " returned status " & CStr(apiStatus) & "."
                SaveImageMsoAsPng = IconExportFailed
                GoTo Cleanup
        End If

        pngEncoder.Data1 = &H557CF406
        pngEncoder.Data2 = &H1A04
        pngEncoder.Data3 = &H11D3
        pngEncoder.Data4(0) = &H9A
        pngEncoder.Data4(1) = &H73
        pngEncoder.Data4(2) = 0
        pngEncoder.Data4(3) = 0
        pngEncoder.Data4(4) = &HF8
        pngEncoder.Data4(5) = &H1E
        pngEncoder.Data4(6) = &HF3
        pngEncoder.Data4(7) = &H2E

        currentStep = "GdipSaveImageToFile"
        apiStatus = GdipSaveImageToFile(bitmap, StrPtr(outputPath), pngEncoder, 0)
        If apiStatus <> 0 Then
                failureDetails = currentStep & " returned status " & CStr(apiStatus) & "."
                SaveImageMsoAsPng = IconExportFailed
                GoTo Cleanup
        End If

        SaveImageMsoAsPng = IconExportSucceeded

Cleanup:
        On Error Resume Next
        If SaveImageMsoAsPng <> IconExportSucceeded And Len(Dir$(outputPath)) > 0 Then Kill outputPath
        If bitmap <> 0 Then GdipDisposeImage bitmap
        On Error GoTo 0
        Exit Function

Failed:
        If currentStep = "GetImageMso" And Err.Number = 5 Then
                failureDetails = "Office rejected this idMso (VBA error 5): " & Err.Description
                SaveImageMsoAsPng = IconExportUnavailable
        Else
                failureDetails = currentStep & " failed (VBA error " & CStr(Err.Number) & "): " & Err.Description
                SaveImageMsoAsPng = IconExportFailed
        End If
        Err.Clear
        GoTo Cleanup
End Function

Private Sub WriteRunSummary(ByVal statusSheet As Worksheet, ByVal listPath As String, ByVal outputFolder As String, ByVal exportedCount As Long, ByVal updatedCount As Long, ByVal skippedCount As Long, ByVal statusChangedCount As Long, ByVal unavailableIds As Collection, ByVal errorCount As Long, ByVal failureMessage As String, ByVal verboseMode As Boolean, ByVal runLog As Collection, ByVal startIndex As Long, ByVal maxItems As Long, ByVal processedCount As Long)
        Dim index As Long
        Dim logEntry As Variant

        statusSheet.Cells.ClearContents
        statusSheet.Range("A1").Value = "ImageMso export"
        statusSheet.Range("A2").Value = "Exported"
        statusSheet.Range("B2").Value = exportedCount
        statusSheet.Range("A3").Value = "Updated"
        statusSheet.Range("B3").Value = updatedCount
        statusSheet.Range("A4").Value = "Unchanged"
        statusSheet.Range("B4").Value = skippedCount
        statusSheet.Range("A5").Value = "Status changes"
        statusSheet.Range("B5").Value = statusChangedCount
        statusSheet.Range("A6").Value = "Unavailable"
        statusSheet.Range("B6").Value = unavailableIds.Count
        statusSheet.Range("A7").Value = "Errors"
        statusSheet.Range("B7").Value = errorCount
        statusSheet.Range("A8").Value = "List file"
        statusSheet.Range("B8").Value = listPath
        statusSheet.Range("A9").Value = "Output folder"
        statusSheet.Range("B9").Value = outputFolder
        statusSheet.Range("A10").Value = "Run error"
        statusSheet.Range("B10").Value = failureMessage
        statusSheet.Range("A11").Value = "Batch start"
        statusSheet.Range("B11").Value = startIndex
        statusSheet.Range("C11").Value = "Batch size"
        statusSheet.Range("D11").Value = maxItems
        statusSheet.Range("E11").Value = "Processed"
        statusSheet.Range("F11").Value = processedCount

        If verboseMode Or runLog.Count > 0 Then
                statusSheet.Range("A13").Value = "idMso"
                statusSheet.Range("B13").Value = "Status"
                statusSheet.Range("C13").Value = "Details"
                For index = 1 To runLog.Count
                        logEntry = runLog(index)
                        statusSheet.Cells(index + 13, 1).Value = logEntry(0)
                        statusSheet.Cells(index + 13, 2).Value = logEntry(1)
                        statusSheet.Cells(index + 13, 3).Value = logEntry(2)
                Next index
        ElseIf unavailableIds.Count > 0 Then
                statusSheet.Range("A13").Value = "Unavailable idMso values"
                For index = 1 To unavailableIds.Count
                        statusSheet.Cells(index + 13, 1).Value = unavailableIds(index)
                Next index
        End If
End Sub

