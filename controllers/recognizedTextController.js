// controllers/recognizedTextController.js
const saveRecognizedText = async (req, res) => {
  try {
    const { text } = req.body;

    // You can save the text to your database here
    // For example:
    // const newText = new RecognizedText({ text });
    // await newText.save();

    res.status(200).json({ message: 'Text saved successfully' });
  } catch (error) {
    console.error('Error saving recognized text:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

module.exports = { saveRecognizedText };
