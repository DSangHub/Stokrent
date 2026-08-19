// POST /api/dealers/apply-credit-policy
const express = require('express');
const router = express.Router();

router.post('/apply-credit-policy', async (req, res) => {
  const {
    dealerName,
    caDealerLicense, // California OL License
    fein,
    guarantorSsn,
    vehicles, // Array of 5 VINs
    requestedCreditTermsDays = 30
  } = req.body;

  try {
    // 1. Verify Active California Dealer License
    const isDealerValid = await verifyCADMVLicense(caDealerLicense);
    if (!isDealerValid) {
      return res.status(400).json({ error: "Invalid California Dealer License" });
    }

    // 2. Perform Credit & Risk Assessment
    const creditScore = await runBusinessCreditCheck(fein, guarantorSsn);
    if (creditScore < 650) {
      return res.status(422).json({ error: "Credit rating threshold not met for Net-30 terms" });
    }

    // 3. Calculate Premium (30/60/15 Statutory Min + $1M CSL Contingent Umbrella)
    const baseMonthlyPremiumPerUnit = 220.00; // Average base rate
    const totalFleetPremium = vehicles.length * baseMonthlyPremiumPerUnit;

    // 4. Issue Policy Binder & 30-Day Credit Line Invoice
    const policy = await bindCommercialFleetPolicy({
      fein,
      fleetSize: vehicles.length,
      vins: vehicles,
      coverageLimits: { bodilyInjury: "30k/60k", propertyDamage: "15k", csl: "1000k" },
      paymentTerms: `NET_${requestedCreditTermsDays}`
    });

    return res.status(200).json({
      status: "APPROVED",
      creditTerms: "30 Days Net",
      totalPremiumDue: totalFleetPremium,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      policyNumber: policy.policyNumber,
      certificateUrl: policy.certificatePdfUrl
    });

  } catch (error) {
    return res.status(500).json({ error: "Underwriting processing failed", details: error.message });
  }
});

module.exports = router;
