import { useState, useEffect } from "react";
import { Layout, Menu, message, List, Button, Table, Card, Space, Typography, Tag } from "antd";
import { HomeOutlined, ThunderboltOutlined, CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";
import { API_BASE_URL } from "./config";
import { getCurrentResidentTransactions, getAllCurrentResidentTransactions, calculateMonthlyEnergyStats, ChargeTransaction, MonthlyEnergyStats } from "./services/chargeTransactionService";

const { Content } = Layout;
const { Text } = Typography;

interface Card {
  rfid: string;
  resident_id: number;
}

interface MeterValues {
  timestamp: string;
  connectorId: number;
  transactionId: number;
  context: string;
  data: {
    "Current.Offered": number;
    "Current.Import.L1": number;
    "Current.Import.L2": number;
    "Current.Import.L3": number;
    "Voltage.L1": number;
    "Voltage.L2": number;
    "Voltage.L3": number;
    "Energy.Active.Import.Register": number;
    "Power.Active.Import": number;
  };
}

const Home: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>("home");
  const [myCards, setMyCards] = useState<Card[]>([]);
  const [refusedCards, setRefusedCards] = useState<Array<{station_id: string; timestamp: string}>>([]);
  const [chargeTransactions, setChargeTransactions] = useState<ChargeTransaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyEnergyStats[]>([]);
  const [monthlyStatsLoading, setMonthlyStatsLoading] = useState(false);
  
  // New state for station status
  const [meterValues, setMeterValues] = useState<MeterValues | null>(null);
  const [stationStatus, setStationStatus] = useState<'available' | 'charging' | 'unknown'>('unknown');
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  const [isResidentCharging, setIsResidentCharging] = useState(false);
  const [myCardsLoaded, setMyCardsLoaded] = useState(false);

  const fetchMyCards = () => {
    fetch(`${API_BASE_URL}/cards/my_cards`, {
      credentials: 'include', // Include cookies for authentication
    })
      .then(response => {
        if (response.ok) {
          return response.json();
        }
        throw new Error('Failed to fetch cards');
      })
      .then(data => {
        setMyCards(data.cards);
        setMyCardsLoaded(true);
      })
      .catch(error => console.error("Error fetching my cards:", error));
  };

  const fetchRefusedCards = () => {
    fetch(`${API_BASE_URL}/cards/refused`)
      .then(response => response.json())
      .then(data => setRefusedCards(data.refused_cards))
      .catch(error => console.error("Error fetching refused cards:", error));
  };

  const fetchChargeTransactions = async (page: number = 1, size: number = 10) => {
    setTransactionsLoading(true);
    try {
      const skip = (page - 1) * size;
      const response = await getCurrentResidentTransactions(skip, size);
      setChargeTransactions(response.transactions);
      setTotalTransactions(response.total);
      setCurrentPage(page);
      setPageSize(size);
    } catch (error) {
      console.error("Error fetching charge transactions:", error);
      message.error("Failed to load charge transactions");
    } finally {
      setTransactionsLoading(false);
    }
  };

  const fetchMonthlyStats = async () => {
    setMonthlyStatsLoading(true);
    try {
      const allTransactions = await getAllCurrentResidentTransactions();
      const stats = calculateMonthlyEnergyStats(allTransactions);
      setMonthlyStats(stats);
    } catch (error) {
      console.error("Error fetching monthly stats:", error);
      message.error("Failed to load monthly statistics");
    } finally {
      setMonthlyStatsLoading(false);
    }
  };

  const fetchMeterValues = async () => {
    try {
      const response = await fetch('/meter_values.json');
      if (response.ok) {
        const data: MeterValues = await response.json();
        setMeterValues(data);
        setLastUpdateTime(new Date());
        
        // Check if the file was updated recently (within 2 minutes)
        const fileTimestamp = new Date(data.timestamp);
        const now = new Date();
        const timeDiff = now.getTime() - fileTimestamp.getTime();
        const twoMinutes = 2 * 60 * 1000; // 2 minutes in milliseconds
        
        if (timeDiff < twoMinutes) {
          setStationStatus('charging');
          // Check if the resident is charging by comparing RFID
          if (myCards.length > 0 && data.context) {
            const isResidentCard = myCards.some(card => card.rfid === data.context);
            setIsResidentCharging(isResidentCard);
          } else {
            setIsResidentCharging(false);
          }
        } else {
          setStationStatus('available');
          setIsResidentCharging(false);
        }
      } else {
        setStationStatus('unknown');
        setIsResidentCharging(false);
      }
    } catch (error) {
      console.error("Error fetching meter values:", error);
      setStationStatus('unknown');
      setIsResidentCharging(false);
    }
  };

  useEffect(() => {
    fetchMyCards();
    fetchRefusedCards();
    fetchChargeTransactions();
    fetchMonthlyStats();
    fetchMeterValues(); // Fetch meter values on mount
  }, []);

  // Set up interval to fetch meter values every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchMeterValues();
    }, 10000); // 10 seconds

    return () => clearInterval(interval);
  }, [myCards]); // Re-run when myCards changes to update resident charging status

  const handleAddCard = (stationId: string) => {
    fetch(`${API_BASE_URL}/cards/add_card/${stationId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then(response => {
        if (!response.ok) {
          throw new Error("Failed to add card");
        }
        return response.json();
      })
      .then(() => {
        message.success("Card added successfully");
        // Refresh both lists after successful addition
        fetchMyCards();
        fetchRefusedCards();
      })
      .catch(error => {
        console.error("Error adding card:", error);
        message.error("Failed to add card");
      });
  };

  const handleTableChange = (pagination: { current?: number; pageSize?: number }) => {
    fetchChargeTransactions(pagination.current || 1, pagination.pageSize || 10);
  };

  const transactionColumns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      render: (id: number) => <Text code>{id}</Text>,
    },
    {
      title: 'Station',
      dataIndex: 'station_id',
      key: 'station_id',
      render: (stationId: string) => <Text strong>{stationId}</Text>,
    },
    {
      title: 'RFID',
      dataIndex: 'rfid',
      key: 'rfid',
      render: (rfid: string) => (
        <Text code style={{ fontSize: '12px' }}>{rfid}</Text>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'created',
      key: 'created',
      render: (created: string) => (
        <Text>{new Date(created).toLocaleDateString()}</Text>
      ),
    },
    {
      title: 'Time',
      dataIndex: 'created',
      key: 'created_time',
      render: (created: string) => (
        <Text>{new Date(created).toLocaleTimeString()}</Text>
      ),
    },
    {
      title: 'Energy (kWh)',
      dataIndex: 'final_energy_kwh',
      key: 'final_energy_kwh',
      render: (energy: number | null) => (
        <Text type={energy ? 'success' : 'secondary'}>
          {energy ? `${energy.toFixed(1)} kWh` : 'N/A'}
        </Text>
      ),
    },
  ];

  return (
    <Layout style={{ 
      minHeight: "100vh",
      maxWidth: "800px",
      margin: "0 auto",
      display: "flex",
      flexDirection: "column"
    }}>
      <Content style={{ 
        flex: 1,
        padding: "16px",
        overflowY: "auto",
        backgroundColor: "#fff"
      }}>
        {activeTab === "home" && (
          <div>
            <h1 style={{ 
              fontSize: "24px",
              marginBottom: "16px"
            }}>
              EV Charger Resident app
            </h1>
            
            {/* Current Station Status Card - Only show after My Cards have loaded */}
            {myCardsLoaded && (
              <Card
                title={
                  <Space>
                    <span>Current Station Status</span>
                  </Space>
                }
                style={{ marginBottom: "24px" }}
              >
                {stationStatus === 'available' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Tag color="success" icon={<CheckCircleOutlined />}>
                      Available
                    </Tag>
                    {lastUpdateTime && (
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        Last updated: {lastUpdateTime.toLocaleTimeString()}
                      </Text>
                    )}
                  </div>
                )}
                
                {stationStatus === 'charging' && isResidentCharging && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <Tag color="success" icon={<CheckCircleOutlined />}>
                        Charging
                      </Tag>
                      {lastUpdateTime && (
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          Last updated: {lastUpdateTime.toLocaleTimeString()}
                        </Text>
                      )}
                    </div>
                    <Text type="success" strong style={{ display: 'block', marginBottom: '8px' }}>
                      You are charging now.
                    </Text>
                    {meterValues && (
                      <div>
                        <Text type="secondary" style={{ fontSize: '12px', display: 'block' }}>
                          Power: {meterValues.data["Power.Active.Import"].toFixed(2)} kW
                        </Text>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          Energy: {meterValues.data["Energy.Active.Import.Register"].toFixed(2)} kWh
                        </Text>
                      </div>
                    )}
                  </div>
                )}
                
                {stationStatus === 'charging' && !isResidentCharging && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <Tag color="warning" icon={<CheckCircleOutlined />}>
                        Charging
                      </Tag>
                      {lastUpdateTime && (
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          Last updated: {lastUpdateTime.toLocaleTimeString()}
                        </Text>
                      )}
                    </div>
                    <Text type="warning" strong style={{ display: 'block', marginBottom: '8px' }}>
                      Another resident is charging.
                    </Text>
                    {meterValues && (
                      <div>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          Energy: {meterValues.data["Energy.Active.Import.Register"].toFixed(2)} kWh
                        </Text>
                      </div>
                    )}
                  </div>
                )}
                
                {stationStatus === 'unknown' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Tag color="error" icon={<CloseCircleOutlined />}>
                      Unknown
                    </Tag>
                    {lastUpdateTime && (
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        Last updated: {lastUpdateTime.toLocaleTimeString()}
                      </Text>
                    )}
                  </div>
                )}
              </Card>
            )}
            
            {/* Monthly Energy Statistics Card */}
            <Card
              title={
                <Space>
                  <span>Monthly Usage</span>
                </Space>
              }
              style={{ marginBottom: "24px" }}
            >
              <Table
                dataSource={monthlyStats}
                columns={[
                  {
                    title: 'Month',
                    dataIndex: 'month',
                    key: 'month',
                    render: (month: string, record: MonthlyEnergyStats) => (
                      <Text strong>{`${month} '${String(record.year).slice(-2)}`}</Text>
                    ),
                  },
                  {
                    title: 'Energy (kWh)',
                    dataIndex: 'totalEnergy',
                    key: 'totalEnergy',
                    render: (energy: number) => (
                      <Text type="success" strong>
                        {energy.toFixed(1)} kWh
                      </Text>
                    ),
                  },
                  {
                    title: 'Transactions',
                    dataIndex: 'transactionCount',
                    key: 'transactionCount',
                    render: (count: number) => (
                      <Text>{count}</Text>
                    ),
                  },
                ]}
                rowKey={(record) => `${record.month}-${record.year}`}
                loading={monthlyStatsLoading}
                pagination={false}
                size="small"
                bordered
                locale={{ 
                  emptyText: 'No monthly data found'
                }}
              />
            </Card>

            {/* Charges Card - Full Width */}
            <Card
              title={
                <Space>
                  <ThunderboltOutlined />
                  <span>Charges</span>
                </Space>
              }
              style={{ marginBottom: "24px" }}
            >
              <Table
                dataSource={chargeTransactions}
                columns={transactionColumns}
                rowKey="id"
                loading={transactionsLoading}
                pagination={{
                  current: currentPage,
                  pageSize: pageSize,
                  total: totalTransactions,
                  showSizeChanger: true,
                  showQuickJumper: true,
                  showTotal: (total, range) => 
                    `${range[0]}-${range[1]} of ${total} transactions`,
                  pageSizeOptions: ['5', '10', '20', '50'],
                }}
                onChange={handleTableChange}
                size="small"
                bordered
                locale={{ 
                  emptyText: 'No charge transactions found'
                }}
                scroll={{ x: 800 }}
              />
                          </Card>

            {/* Responsive Layout for My Cards and Refused Cards */}
            <div style={{ 
              display: "flex", 
              flexDirection: "column", 
              gap: "16px",
              marginBottom: "24px"
            }}>
              {/* My Cards Card - Smaller */}
              <Card
                title={
                  <Space>
                    <span>My Cards</span>
                  </Space>
                }
                style={{ flex: "0 0 auto" }}
              >
                <Table
                  dataSource={myCards}
                  columns={[
                    {
                      title: 'RFID',
                      dataIndex: 'rfid',
                      key: 'rfid',
                      render: (rfid: string) => (
                        <span style={{ fontFamily: 'monospace' }}>{rfid}</span>
                      ),
                    },
                    {
                      title: 'Resident ID',
                      dataIndex: 'resident_id',
                      key: 'resident_id',
                    },
                  ]}
                  pagination={false}
                  size="small"
                  bordered
                  locale={{ emptyText: 'No cards found' }}
                />
              </Card>

              {/* Refused Cards List */}
              <List
                header={<h3>Refused Cards</h3>}
                bordered
                dataSource={refusedCards}
                renderItem={item => (
                  <List.Item
                    actions={[<Button type="primary" onClick={() => handleAddCard(item.station_id)}>Add Card</Button>]}
                  >
                    <div>
                      <strong>Station:</strong> {item.station_id} <br />
                      <strong>Timestamp:</strong> {new Date(item.timestamp).toLocaleString()}
                    </div>
                  </List.Item>
                )}
              />
            </div>
          </div>
        )}
      </Content>

      <Menu
        mode="horizontal"
        selectedKeys={[activeTab]}
        onClick={(e) => setActiveTab(e.key)}
        style={{
          position: "sticky",
          bottom: 0,
          width: "100%",
          borderTop: "1px solid #f0f0f0",
          display: "flex",
          justifyContent: "center"
        }}
        items={[
          {
            key: "home",
            label: "Charge APT",
            icon: <HomeOutlined />
          }
        ]}
      />
    </Layout>
  );
};

export default Home;
