Attribute VB_Name = "IconExporter"
Option Explicit

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
	Const listFileName As String = "idMso-List.txt"

	Dim fileSystem As Object
	Dim inputFile As Object
	Dim statusSheet As Worksheet
	Dim unavailableIds As Collection
	Dim startupInput As GdiplusStartupInput
	Dim pngEncoder As Guid
	Dim projectFolder As String
	Dim galleryRoot As String
	Dim listPath As String
	Dim outputFolder As String
	Dim idMso As String
	Dim outputPath As String
	Dim exportedCount As Long
	Dim skippedCount As Long
	Dim gdiplusToken As LongPtr
	Dim startupStatus As Long
	Dim failureMessage As String

	On Error GoTo Failed

	Set fileSystem = CreateObject("Scripting.FileSystemObject")
	Set unavailableIds = New Collection
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
			ElseIf SaveImageMsoAsPng(idMso, outputPath, pngEncoder) Then
				exportedCount = exportedCount + 1
			Else
				unavailableIds.Add idMso
			End If
		End If
	Loop

	GoTo Finished

Failed:
	failureMessage = Err.Description

Finished:
	On Error Resume Next
	If Not inputFile Is Nothing Then inputFile.Close
	If gdiplusToken <> 0 Then GdiplusShutdown gdiplusToken
	WriteRunSummary statusSheet, listPath, outputFolder, exportedCount, skippedCount, unavailableIds, failureMessage
	ThisWorkbook.Save
	On Error GoTo 0
End Sub

Private Function SaveImageMsoAsPng(ByVal idMso As String, ByVal outputPath As String, ByRef pngEncoder As Guid) As Boolean
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

	On Error GoTo Failed

	Set picture = Application.CommandBars.GetImageMso(idMso, 32, 32)
	If picture Is Nothing Then GoTo Failed

	If GetObjectBitmap(picture.Handle, UBound(bitmapInfo) + 1, bitmapInfo(0)) = 0 Then GoTo Failed

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

		If GdipCreateBitmapFromScan0(bitmapWidth, bitmapHeight, stride, &H26200A, VarPtr(pixelBytes(0)), bitmap) <> 0 Then GoTo Failed
	Else
		If GdipCreateBitmapFromHBITMAP(picture.Handle, 0, bitmap) <> 0 Then GoTo Failed
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

	If GdipSaveImageToFile(bitmap, StrPtr(outputPath), pngEncoder, 0) <> 0 Then GoTo Failed

	SaveImageMsoAsPng = True

Cleanup:
	If bitmap <> 0 Then GdipDisposeImage bitmap
	Exit Function

Failed:
	On Error Resume Next
	If Len(Dir$(outputPath)) > 0 Then Kill outputPath
	Err.Clear
	Resume Cleanup
End Function

Private Sub WriteRunSummary(ByVal statusSheet As Worksheet, ByVal listPath As String, ByVal outputFolder As String, ByVal exportedCount As Long, ByVal skippedCount As Long, ByVal unavailableIds As Collection, ByVal failureMessage As String)
	Dim index As Long

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

	If unavailableIds.Count > 0 Then
		statusSheet.Range("A9").Value = "Unavailable idMso values"
		For index = 1 To unavailableIds.Count
			statusSheet.Cells(index + 9, 1).Value = unavailableIds(index)
		Next index
	End If
End Sub

