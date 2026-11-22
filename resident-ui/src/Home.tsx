import { useCallback, useEffect, useMemo, useState } from "react";
import { App, Col, Row } from "antd";
import { calculateMonthlyEnergyStats, getAllCurrentResidentTransactions, type ChargeTransaction } from "./services/chargeTransactionService";
import { addCard, getMyCards, getRefusedCards, updateCardName, type Card as CardType, type RefusedCard } from "./services/cardService";
import { chargingCostService } from "./services/chargingCostService";
import { useStationStatus } from "./hooks/useStationStatus";
import AppHeader from "./components/AppHeader";
import StationStatusCard from "./components/StationStatusCard";
import MonthlyUsageCard from "./components/MonthlyUsageCard";
import UsageSummary from "./components/UsageSummary";
import ChargesCard from "./components/ChargesCard";
import MyCardsCard from "./components/MyCardsCard";
import RefusedCardsCard from "./components/RefusedCardsCard";

const Home: React.FC = () => {
  const { message } = App.useApp();
  const station = useStationStatus();
  const [transactions, setTransactions] = useState<ChargeTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [cards, setCards] = useState<CardType[]>([]);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [refusedCards, setRefusedCards] = useState<RefusedCard[]>([]);
  const [rate, setRate] = useState<number | null>(null);

  const monthlyStats = useMemo(() => calculateMonthlyEnergyStats(transactions), [transactions]);

  const loadTransactions = useCallback(async () => {
    try {
      setTransactions(await getAllCurrentResidentTransactions());
    } catch (error) {
      console.error("Error fetching charge transactions:", error);
      message.error("Failed to load your charging sessions");
    } finally {
      setTransactionsLoading(false);
    }
  }, [message]);

  const loadCards = useCallback(async () => {
    try {
      setCards(await getMyCards());
    } catch (error) {
      console.error("Error fetching my cards:", error);
    } finally {
      setCardsLoading(false);
    }
  }, []);

  const loadRefusedCards = useCallback(async () => {
    try {
      setRefusedCards(await getRefusedCards());
    } catch (error) {
      console.error("Error fetching refused cards:", error);
    }
  }, []);

  const loadRate = useCallback(async () => {
    try {
      const cost = await chargingCostService.getActiveChargingCost();
      setRate(cost.kwh_price);
    } catch (error) {
      console.error("Error fetching active charging cost:", error);
    }
  }, []);

  useEffect(() => {
    loadTransactions();
    loadCards();
    loadRefusedCards();
    loadRate();
  }, [loadTransactions, loadCards, loadRefusedCards, loadRate]);

  const handleAddCard = async (stationId: string) => {
    try {
      await addCard(stationId);
      message.success("Card added to your account");
      loadCards();
      loadRefusedCards();
    } catch (error) {
      console.error("Error adding card:", error);
      message.error("Failed to add card");
    }
  };

  const handleRenameCard = async (rfid: string, name: string) => {
    try {
      await updateCardName(rfid, name);
      message.success("Card renamed");
      loadCards();
    } catch (error) {
      console.error("Error updating card name:", error);
      message.error("Failed to rename card");
    }
  };

  return (
    <>
      <AppHeader />
      <main className="page-container">
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={10}>
            <StationStatusCard {...station} rate={rate} />
          </Col>
          <Col xs={24} lg={14}>
            <MonthlyUsageCard stats={monthlyStats} loading={transactionsLoading} />
          </Col>
          <Col span={24}>
            <UsageSummary transactions={transactions} loading={transactionsLoading} />
          </Col>
          <Col span={24}>
            <ChargesCard transactions={transactions} loading={transactionsLoading} />
          </Col>
          <Col xs={24} lg={12}>
            <MyCardsCard cards={cards} loading={cardsLoading} onRename={handleRenameCard} />
          </Col>
          <Col xs={24} lg={12}>
            <RefusedCardsCard refusedCards={refusedCards} onAdd={handleAddCard} />
          </Col>
        </Row>
      </main>
    </>
  );
};

export default Home;
