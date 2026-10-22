Attribute VB_Name = "IconExporter"
Option Explicit

Private Enum IconExportResult
	IconExportSucceeded = 1
	IconExportUnavailable = 2
	IconExportFailed = 3
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

Public Sub ExportMissingIcons()
	ExportIcons False
End Sub

Public Function RunExportMissingIcons() As String
	RunExportMissingIcons = ExportIcons(False)
End Function

Public Function RunExportMissingIconsVerbose() As String
	RunExportMissingIconsVerbose = ExportIcons(True)
End Function

Private Function ExportIcons(ByVal verboseMode As Boolean) As String
	Const listFileName As String = "idMso-List.txt"

	Dim fileSystem As Object
	Dim inputFile As Object
	Dim statusSheet As Worksheet
	Dim unavailableIds As Collection
	Dim runLog As Collection
	Dim startupInput As GdiplusStartupInput
	Dim pngEncoder As Guid
	Dim projectFolder As String
	Dim galleryRoot As String
	Dim listPath As String
	Dim outputFolder As String
	Dim idMso As String
	Dim outputPath As String
	Dim resultDetails As String
	Dim resultStatus As String
	Dim exportResult As IconExportResult
	Dim exportedCount As Long
	Dim skippedCount As Long
	Dim errorCount As Long
	Dim gdiplusToken As LongPtr
	Dim startupStatus As Long
	Dim failureMessage As String

	On Error GoTo Failed

	Set fileSystem = CreateObject("Scripting.FileSystemObject")
	Set unavailableIds = New Collection
	Set runLog = New Collection
	Set statusSheet = ThisWorkbook.Worksheets(1)

	projectFolder = fileSystem.GetParentFolderName(ThisWorkbook.Path)
	galleryRoot = fileSystem.GetParentFolderName(projectFolder)
	listPath = fileSystem.BuildPath(projectFolder, listFileName)
	outputFolder = galleryRoot

	If Not fileSystem.FileExists(listPath) Then
		Err.Raise vbObjectError + 1000, "ExportMissingIcons", "Cannot find " & listPath
	End If

	If Not fileSystem.FolderExists(outputFolder) Then
		Err.Raise vbObjectError + 1001, "ExportMissingIcons", "Cannot find output folder " & outputFolder
	End If

	startupInput.GdiplusVersion = 1
	startupStatus = GdiplusStartup(gdiplusToken, startupInput, 0)
	If startupStatus <> 0 Then
		Err.Raise vbObjectError + 1002, "ExportMissingIcons", "GDI+ could not be started. Status: " & startupStatus
	End If

	Set inputFile = fileSystem.OpenTextFile(listPath, 1, False, -2)
	Do While Not inputFile.AtEndOfStream
		idMso = Trim$(inputFile.ReadLine)
		If Len(idMso) > 0 Then
			outputPath = fileSystem.BuildPath(outputFolder, idMso & ".png")
			If fileSystem.FileExists(outputPath) Then
				skippedCount = skippedCount + 1
				resultStatus = "Already existed"
				resultDetails = "PNG already existed."
			Else
				resultDetails = vbNullString
				exportResult = SaveImageMsoAsPng(idMso, outputPath, pngEncoder, resultDetails)
				Select Case exportResult
					Case IconExportSucceeded
						exportedCount = exportedCount + 1
						resultStatus = "Exported"
						resultDetails = "PNG exported."
					Case IconExportUnavailable
						unavailableIds.Add idMso
						resultStatus = "Unavailable"
					Case Else
						errorCount = errorCount + 1
						resultStatus = "Error"
				End Select
			End If

			If verboseMode Then
				runLog.Add Array(idMso, resultStatus, resultDetails)
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
	WriteRunSummary statusSheet, listPath, outputFolder, exportedCount, skippedCount, unavailableIds, errorCount, failureMessage, verboseMode, runLog
	ThisWorkbook.Save
	On Error GoTo 0
	If Len(failureMessage) > 0 Then
		ExportIcons = "Export failed: " & failureMessage
	Else
		ExportIcons = "Export complete. Exported " & CStr(exportedCount) & _
			", skipped " & CStr(statusSheet.Range("B3").Value) & _
			", unavailable " & CStr(unavailableIds.Count) & _
			", errors " & CStr(errorCount)
	End If
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

Private Sub WriteRunSummary(ByVal statusSheet As Worksheet, ByVal listPath As String, ByVal outputFolder As String, ByVal exportedCount As Long, ByVal skippedCount As Long, ByVal unavailableIds As Collection, ByVal errorCount As Long, ByVal failureMessage As String, ByVal verboseMode As Boolean, ByVal runLog As Collection)
	Dim index As Long
	Dim logEntry As Variant

	statusSheet.Cells.ClearContents
	statusSheet.Range("A1").Value = "ImageMso export"
	statusSheet.Range("A2").Value = "Exported"
	statusSheet.Range("B2").Value = exportedCount
	statusSheet.Range("A3").Value = "Already existed"
	statusSheet.Range("B3").Value = skippedCount
	statusSheet.Range("A4").Value = "Unavailable"
	statusSheet.Range("B4").Value = unavailableIds.Count
	statusSheet.Range("A5").Value = "List file"
	statusSheet.Range("B5").Value = listPath
	statusSheet.Range("A6").Value = "Output folder"
	statusSheet.Range("B6").Value = outputFolder
	statusSheet.Range("A7").Value = "Run error"
	statusSheet.Range("B7").Value = failureMessage
	statusSheet.Range("A8").Value = "Item errors"
	statusSheet.Range("B8").Value = errorCount

	If verboseMode Then
		statusSheet.Range("A9").Value = "idMso"
		statusSheet.Range("B9").Value = "Status"
		statusSheet.Range("C9").Value = "Details"
		For index = 1 To runLog.Count
			logEntry = runLog(index)
			statusSheet.Cells(index + 9, 1).Value = logEntry(0)
			statusSheet.Cells(index + 9, 2).Value = logEntry(1)
			statusSheet.Cells(index + 9, 3).Value = logEntry(2)
		Next index
	ElseIf unavailableIds.Count > 0 Then
		statusSheet.Range("A9").Value = "Unavailable idMso values"
		For index = 1 To unavailableIds.Count
			statusSheet.Cells(index + 9, 1).Value = unavailableIds(index)
		Next index
	End If
End Sub

